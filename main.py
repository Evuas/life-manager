from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import json
import base64
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from openai import OpenAI
import uvicorn

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========== MODELS ==========
class TokenRequest(BaseModel):
    token: str

class DraftRequest(BaseModel):
    token: str
    email_id: str
    sender: str
    subject: str
    body: str
    tone: str = "Direct & Concise"

class VibeRequest(BaseModel):
    message: str

# ========== HELPERS ==========
def get_gmail_service(token_json):
    creds = Credentials(**json.loads(token_json))
    return build("gmail", "v1", credentials=creds)

# ========== GOOGLE OAUTH ==========
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
REDIRECT_URI = os.getenv("REDIRECT_URI", "https://inbox-assassin-ai.onrender.com/auth/google/callback")

@app.get("/auth/google/url")
def get_auth_url():
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [REDIRECT_URI],
            }
        },
        scopes=["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"],
    )
    flow.redirect_uri = REDIRECT_URI
    auth_url, _ = flow.authorization_url(prompt="consent")
    return {"auth_url": auth_url}

@app.get("/auth/google/callback")
def auth_callback(code: str):
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [REDIRECT_URI],
            }
        },
        scopes=["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"],
    )
    flow.redirect_uri = REDIRECT_URI
    flow.fetch_token(code=code)
    return {"status": "success", "token": flow.credentials.to_json()}

# ========== INBOX ENDPOINT ==========
@app.post("/api/inbox")
async def get_inbox(req: TokenRequest):
    service = get_gmail_service(req.token)
    result = service.users().messages().list(userId="me", maxResults=20).execute()
    messages = result.get("messages", [])
    
    emails = []
    for msg in messages:
        msg_data = service.users().messages().get(userId="me", id=msg["id"], format="full").execute()
        payload = msg_data.get("payload", {})
        headers = payload.get("headers", [])
        
        subject = next((h["value"] for h in headers if h["name"] == "Subject"), "No Subject")
        sender = next((h["value"] for h in headers if h["name"] == "From"), "Unknown")
        snippet = msg_data.get("snippet", "")
        
        body = ""
        if "parts" in payload:
            for part in payload["parts"]:
                if part["mimeType"] == "text/plain":
                    data = part["body"].get("data")
                    if data:
                        body = base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")
                        break
        elif payload["mimeType"] == "text/plain":
            data = payload["body"].get("data")
            if data:
                body = base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")
        
        emails.append({"id": msg["id"], "subject": subject, "sender": sender, "snippet": snippet, "body": body[:1000]})
    
    # AI Tagging
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        client = OpenAI(api_key=openai_key)
        email_texts = "\n\n".join([f"ID: {i}\nSubject: {e['subject']}\nSnippet: {e['snippet']}" for i, e in enumerate(emails)])
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Categorize each email ID as Urgent, Strategic, or Noise. Return JSON."},
                {"role": "user", "content": email_texts}
            ],
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        tags = json.loads(response.choices[0].message.content)
        for i, e in enumerate(emails):
            e["priority"] = tags.get(str(i), "Noise")
    else:
        for e in emails:
            e["priority"] = "Noise"
    return {"emails": emails}

# ========== DRAFT ENDPOINT ==========
@app.post("/api/draft")
async def draft_email(req: DraftRequest):
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        raise HTTPException(500, "OpenAI key missing")
    
    client = OpenAI(api_key=openai_key)
    prompt = f"Tone: {req.tone}. Reply to: Sender: {req.sender}, Subject: {req.subject}, Body: {req.body}. Write ONLY the reply body."
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}]
    )
    reply_body = response.choices[0].message.content
    
    service = get_gmail_service(req.token)
    raw_message = f"To: {req.sender}\r\nSubject: Re: {req.subject}\r\n\r\n{reply_body}"
    raw_base64 = base64.urlsafe_b64encode(raw_message.encode()).decode()
    draft = {"message": {"raw": raw_base64}}
    service.users().drafts().create(userId="me", body=draft).execute()
    return {"draft": reply_body}

# ========== VIBE CHECK ==========
@app.post("/api/vibe")
async def vibe_check(req: VibeRequest):
    return {"status": "logged", "mood": req.message}

# ========== FINANCE ==========
@app.get("/api/finance")
async def get_finance():
    return {"runway": 8.2, "mrr": 12400}

# ========== HEALTH CHECK ==========
@app.get("/")
async def health_check():
    return {"status": "healthy", "message": "Inbox Assassin API is running!"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)