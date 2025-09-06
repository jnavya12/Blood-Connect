from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Session middleware for cookies
app.add_middleware(SessionMiddleware, secret_key="blood-donation-secret-key-12345")

# Security
security = HTTPBearer(auto_error=False)

# Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    picture: Optional[str] = None
    user_type: str  # "donor", "requester", "ngo"
    city: str
    phone: Optional[str] = None
    emergency_contact: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    email: str
    name: str
    user_type: str
    city: str
    phone: Optional[str] = None
    emergency_contact: Optional[str] = None

class BloodRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    requester_id: str
    requester_name: str
    requester_phone: str
    patient_name: str
    blood_group: Optional[str] = None  # For future use
    units_needed: int
    hospital_name: str
    hospital_address: str
    city: str
    urgency: str  # "critical", "urgent", "normal"
    description: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "active"  # "active", "fulfilled", "expired"
    responses_count: int = 0

class BloodRequestCreate(BaseModel):
    patient_name: str
    blood_group: Optional[str] = None
    units_needed: int
    hospital_name: str
    hospital_address: str
    city: str
    urgency: str
    description: str

class DonorResponse(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    request_id: str
    donor_id: str
    donor_name: str
    donor_phone: str
    donor_email: str
    message: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "pending"  # "pending", "accepted", "completed"

class DonorResponseCreate(BaseModel):
    request_id: str
    message: str

class Session(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Authentication helpers
async def get_current_user(request: Request, credentials: HTTPAuthorizationCredentials = Depends(security)):
    session_token = None
    
    # Try to get token from Authorization header first
    if credentials:
        session_token = credentials.credentials
    
    # Fallback to cookie
    if not session_token:
        session_token = request.cookies.get("session_token")
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Find session in database
    session = await db.sessions.find_one({"session_token": session_token})
    if not session:
        raise HTTPException(status_code=401, detail="Session expired")
    
    # Handle timezone-aware datetime comparison
    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=401, detail="Session expired")
    
    # Get user
    user = await db.users.find_one({"id": session["user_id"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return User(**user)

# Auth routes
@api_router.get("/auth/profile")
async def get_profile(request: Request):
    """Handle profile redirect from Emergent Auth"""
    session_id = request.query_params.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session_id")
    
    # Call Emergent auth API to get user data
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            response.raise_for_status()
            user_data = response.json()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Authentication failed: {str(e)}")
    
    # Create or get existing user
    existing_user = await db.users.find_one({"email": user_data["email"]})
    if not existing_user:
        # New user - we'll set default values, user can update later
        user = User(
            email=user_data["email"],
            name=user_data["name"],
            picture=user_data.get("picture"),
            user_type="requester",  # Default type
            city="Unknown"  # Will be updated by user
        )
        await db.users.insert_one(user.dict())
    else:
        user = User(**existing_user)
    
    # Create session
    session_token = user_data["session_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    session = Session(
        user_id=user.id,
        session_token=session_token,
        expires_at=expires_at
    )
    await db.sessions.insert_one(session.dict())
    
    return {
        "user": user,
        "session_token": session_token,
        "redirect_to": "/dashboard"
    }

@api_router.post("/auth/set-session")
async def set_session_cookie(request: Request, response: Response):
    """Set session cookie from frontend"""
    body = await request.json()
    session_token = body.get("session_token")
    
    if not session_token:
        raise HTTPException(status_code=400, detail="Missing session_token")
    
    response.set_cookie(
        key="session_token",
        value=session_token,
        max_age=7 * 24 * 60 * 60,  # 7 days
        httponly=True,
        secure=True,
        samesite="none",
        path="/"
    )
    
    return {"message": "Session cookie set"}

@api_router.get("/auth/me", response_model=User)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    return current_user

@api_router.put("/auth/profile", response_model=User)
async def update_profile(profile_update: dict, current_user: User = Depends(get_current_user)):
    """Update user profile"""
    # Update user in database
    await db.users.update_one(
        {"id": current_user.id},
        {"$set": profile_update}
    )
    
    # Return updated user
    updated_user = await db.users.find_one({"id": current_user.id})
    return User(**updated_user)

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response, current_user: User = Depends(get_current_user)):
    """Logout user"""
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.sessions.delete_one({"session_token": session_token})
    
    response.delete_cookie("session_token", path="/")
    return {"message": "Logged out successfully"}

# Blood Request routes
@api_router.post("/requests", response_model=BloodRequest)
async def create_blood_request(request_data: BloodRequestCreate, current_user: User = Depends(get_current_user)):
    """Create a new blood request"""
    blood_request = BloodRequest(
        requester_id=current_user.id,
        requester_name=current_user.name,
        requester_phone=current_user.phone or "Not provided",
        **request_data.dict()
    )
    
    await db.blood_requests.insert_one(blood_request.dict())
    return blood_request

@api_router.get("/requests", response_model=List[BloodRequest])
async def get_blood_requests(city: Optional[str] = None, urgency: Optional[str] = None, status: str = "active"):
    """Get blood requests with optional filters"""
    query = {"status": status}
    if city:
        query["city"] = city
    if urgency:
        query["urgency"] = urgency
    
    requests = await db.blood_requests.find(query).sort("created_at", -1).to_list(1000)
    return [BloodRequest(**req) for req in requests]

@api_router.get("/requests/my", response_model=List[BloodRequest])
async def get_my_requests(current_user: User = Depends(get_current_user)):
    """Get current user's blood requests"""
    requests = await db.blood_requests.find({"requester_id": current_user.id}).sort("created_at", -1).to_list(1000)
    return [BloodRequest(**req) for req in requests]

@api_router.get("/requests/{request_id}", response_model=BloodRequest)
async def get_request_details(request_id: str):
    """Get specific blood request details"""
    request = await db.blood_requests.find_one({"id": request_id})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    return BloodRequest(**request)

@api_router.put("/requests/{request_id}/status")
async def update_request_status(request_id: str, status_data: dict, current_user: User = Depends(get_current_user)):
    """Update request status"""
    request = await db.blood_requests.find_one({"id": request_id})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if request["requester_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.blood_requests.update_one(
        {"id": request_id},
        {"$set": {"status": status_data["status"]}}
    )
    
    return {"message": "Status updated"}

# Donor Response routes
@api_router.post("/responses", response_model=DonorResponse)
async def create_donor_response(response_data: DonorResponseCreate, current_user: User = Depends(get_current_user)):
    """Create a donor response to a blood request"""
    # Check if request exists
    request = await db.blood_requests.find_one({"id": response_data.request_id})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Check if user already responded
    existing_response = await db.donor_responses.find_one({
        "request_id": response_data.request_id,
        "donor_id": current_user.id
    })
    if existing_response:
        raise HTTPException(status_code=400, detail="You have already responded to this request")
    
    donor_response = DonorResponse(
        donor_id=current_user.id,
        donor_name=current_user.name,
        donor_phone=current_user.phone or "Not provided",
        donor_email=current_user.email,
        **response_data.dict()
    )
    
    await db.donor_responses.insert_one(donor_response.dict())
    
    # Update request response count
    await db.blood_requests.update_one(
        {"id": response_data.request_id},
        {"$inc": {"responses_count": 1}}
    )
    
    return donor_response

@api_router.get("/responses/request/{request_id}", response_model=List[DonorResponse])
async def get_request_responses(request_id: str, current_user: User = Depends(get_current_user)):
    """Get all responses for a specific request (only for request owner)"""
    request = await db.blood_requests.find_one({"id": request_id})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if request["requester_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    responses = await db.donor_responses.find({"request_id": request_id}).sort("created_at", -1).to_list(1000)
    return [DonorResponse(**resp) for resp in responses]

@api_router.get("/responses/my", response_model=List[DonorResponse])
async def get_my_responses(current_user: User = Depends(get_current_user)):
    """Get current user's donor responses"""
    responses = await db.donor_responses.find({"donor_id": current_user.id}).sort("created_at", -1).to_list(1000)
    return [DonorResponse(**resp) for resp in responses]

# Stats route
@api_router.get("/stats")
async def get_stats():
    """Get platform statistics"""
    total_requests = await db.blood_requests.count_documents({})
    active_requests = await db.blood_requests.count_documents({"status": "active"})
    total_responses = await db.donor_responses.count_documents({})
    total_users = await db.users.count_documents({})
    
    return {
        "total_requests": total_requests,
        "active_requests": active_requests,
        "total_responses": total_responses,
        "total_users": total_users
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()