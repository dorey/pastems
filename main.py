from fastapi import FastAPI, HTTPException, Depends, Request, Response
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timedelta
import os
import json
from dotenv import load_dotenv
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Initialize Supabase client if available
try:
    # New import for Supabase v2.x
    from supabase.client import create_client, Client
    
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")
    
    if SUPABASE_URL and SUPABASE_KEY:
        # Initialize client with new v2.x method
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        
        # Test connection to verify it works
        try:
            # Simple query to test connection
            test_response = supabase.table("messages").select("*").limit(1).execute()
            logger.info(f"Supabase connection test successful")
            using_supabase = True
        except Exception as e:
            logger.error(f"Supabase connection test failed: {e}")
            using_supabase = False
            logger.warning("Falling back to in-memory storage due to connection error")
    else:
        using_supabase = False
        logger.warning("Supabase credentials not found, using in-memory storage")
except ImportError as e:
    using_supabase = False
    logger.warning(f"Supabase package import error: {e}, using in-memory storage")

# Initialize FastAPI app
app = FastAPI(title="Encrypted Message Service")

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup static files and templates
static_directory = Path("static")
static_directory.mkdir(exist_ok=True)
templates_directory = Path("templates")
templates_directory.mkdir(exist_ok=True)

# Create default template if it doesn't exist
template_path = templates_directory / "index.html"
if not template_path.exists():
    default_template = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Encrypted Messages</title>
</head>
<body>
    <div id="root"></div>
    <script src="/static/js/bundle.js"></script>
</body>
</html>"""
    template_path.write_text(default_template)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# In-memory storage for development when Supabase is not available
message_store = {}

# Models
class MessageCreate(BaseModel):
    uid: str
    encryptedData: str
    expiresAt: datetime
    burnAfterReading: bool = False

class MessageResponse(BaseModel):
    encryptedData: str
    expiresAt: datetime
    burnAfterReading: bool

# Database operations
async def cleanup_expired_messages():
    """Remove messages that have expired from the database"""
    # Use consistent UTC format for all datetime operations - without Z suffix
    now = datetime.utcnow().replace(microsecond=0).isoformat()
    
    if using_supabase:
        # Delete expired messages in Supabase
        try:
            # Use string comparison for consistency
            supabase.table("messages").delete().lt("expires_at", now).execute()
            logger.info(f"Cleaned up expired messages before {now}")
        except Exception as e:
            logger.error(f"Error cleaning up expired messages in Supabase: {e}")
    else:
        # Clean up in-memory store
        global message_store
        now_dt = datetime.utcnow()
        expired_uids = [uid for uid, msg in message_store.items() 
                      if isinstance(msg["expires_at"], datetime) and msg["expires_at"] < now_dt]
        for uid in expired_uids:
            del message_store[uid]
            logger.info(f"Deleted expired message {uid}")

# Routes
@app.post("/api/paste", response_model=dict)
async def create_message(message: MessageCreate):
    """Create a new encrypted message"""
    try:
        if using_supabase:
            # Check if UID already exists
            response = supabase.table("messages").select("uid").eq("uid", message.uid).execute()
            
            if len(response.data) > 0:
                raise HTTPException(status_code=400, detail="Message ID already exists")
            
            # Format dates in PostgreSQL compatible timestamp format
            # Use simple ISO format without timezone suffix - PostgreSQL will handle it correctly
            expires_at_iso = message.expiresAt.replace(microsecond=0).isoformat()
            created_at_iso = datetime.utcnow().replace(microsecond=0).isoformat()
            
            # Log the timestamp format for debugging
            logger.info(f"Using timestamp format: {expires_at_iso}")
            
            # Insert the new message
            response = supabase.table("messages").insert({
                "uid": message.uid,
                "encrypted_data": message.encryptedData,
                "expires_at": expires_at_iso,
                "burn_after_reading": message.burnAfterReading,
                "created_at": created_at_iso
            }).execute()
        else:
            # Store in memory
            if message.uid in message_store:
                raise HTTPException(status_code=400, detail="Message ID already exists")
            
            message_store[message.uid] = {
                "encrypted_data": message.encryptedData,
                "expires_at": message.expiresAt,
                "burn_after_reading": message.burnAfterReading,
                "created_at": datetime.utcnow()
            }
        
        return {"status": "success", "message": "Message created successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating message: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating message: {str(e)}")

@app.get("/api/paste/{uid}", response_model=MessageResponse)
async def get_message(uid: str):
    """Fetch an encrypted message by its UID"""
    try:
        # Run cleanup first
        await cleanup_expired_messages()
        
        if using_supabase:
            # Fetch the message from Supabase
            response = supabase.table("messages").select("*").eq("uid", uid).execute()
            
            if len(response.data) == 0:
                raise HTTPException(status_code=404, detail="Message not found or expired")
            
            message = response.data[0]
            
            # Handle date parsing for consistent datetime handling
            try:
                # If it's a string, parse it to datetime
                if isinstance(message["expires_at"], str):
                    # Handle potential timezone markers (Z, +00:00) for compatibility
                    expires_at_str = message["expires_at"]
                    # Remove Z suffix if it exists
                    if expires_at_str.endswith('Z'):
                        expires_at_str = expires_at_str[:-1]
                    # Try to parse the datetime
                    try:
                        expires_at = datetime.fromisoformat(expires_at_str)
                    except ValueError:
                        # Fallback for older formats
                        logger.warning(f"Using fallback date parsing for: {expires_at_str}")
                        expires_at = datetime.strptime(expires_at_str, "%Y-%m-%dT%H:%M:%S")
                else:
                    # If it's already a datetime, use it directly
                    expires_at = message["expires_at"]
                
                logger.info(f"Successfully parsed expires_at for message {uid}")
                
                return {
                    "encryptedData": message["encrypted_data"],
                    "expiresAt": expires_at,
                    "burnAfterReading": message["burn_after_reading"]
                }
            except Exception as e:
                # Fallback: return as string to prevent comparison issues
                logger.warning(f"Date parsing error for {uid}: {e}, returning raw string")
                
                # Use current time + 1 day as a fallback to prevent immediate expiry
                fallback_date = datetime.utcnow() + timedelta(days=1)
                
                return {
                    "encryptedData": message["encrypted_data"],
                    "expiresAt": fallback_date,
                    "burnAfterReading": message["burn_after_reading"]
                }
        else:
            # Fetch from in-memory store
            if uid not in message_store:
                raise HTTPException(status_code=404, detail="Message not found or expired")
            
            message = message_store[uid]
            
            return {
                "encryptedData": message["encrypted_data"],
                "expiresAt": message["expires_at"],
                "burnAfterReading": message["burn_after_reading"]
            }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching message: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching message: {str(e)}")

@app.post("/api/del/{uid}")
async def delete_message(uid: str):
    """Delete a message (burn after reading)"""
    try:
        if using_supabase:
            # Check if message exists in Supabase
            response = supabase.table("messages").select("uid").eq("uid", uid).execute()
            
            if len(response.data) == 0:
                raise HTTPException(status_code=404, detail="Message not found")
            
            # Delete the message
            supabase.table("messages").delete().eq("uid", uid).execute()
        else:
            # Check and delete from in-memory store
            if uid not in message_store:
                raise HTTPException(status_code=404, detail="Message not found")
            
            del message_store[uid]
        
        return {"status": "success", "message": "Message deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting message: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting message: {str(e)}")

@app.get("/api/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

@app.get("/{full_path:path}", response_class=HTMLResponse)
async def serve_app(request: Request, full_path: str):
    """Serve the SPA for all other routes"""
    return templates.TemplateResponse("index.html", {"request": request})

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port)