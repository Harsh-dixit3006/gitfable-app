"""Firebase Admin SDK initialization."""

import json
import os
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, auth

from app.config import (
    FIREBASE_SERVICE_ACCOUNT_PATH,
    FIREBASE_PROJECT_ID,
    FIREBASE_PRIVATE_KEY_ID,
    FIREBASE_PRIVATE_KEY,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_CLIENT_ID,
    FIREBASE_AUTH_URI,
    FIREBASE_TOKEN_URI,
    FIREBASE_AUTH_PROVIDER_CERT_URL,
    FIREBASE_CLIENT_CERT_URL,
)

# Global Firebase app instance
_firebase_app = None


def get_firebase_app():
    """Get or initialize Firebase Admin SDK."""
    global _firebase_app

    if _firebase_app is None:
        # Try to load service account from file first
        if FIREBASE_SERVICE_ACCOUNT_PATH and os.path.exists(
            FIREBASE_SERVICE_ACCOUNT_PATH
        ):
            cred = credentials.Certificate(FIREBASE_SERVICE_ACCOUNT_PATH)
            _firebase_app = firebase_admin.initialize_app(cred)
        # Then try to build from environment variables
        elif FIREBASE_PROJECT_ID and FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL:
            service_account_info = {
                "type": "service_account",
                "project_id": FIREBASE_PROJECT_ID,
                "private_key_id": FIREBASE_PRIVATE_KEY_ID,
                "private_key": FIREBASE_PRIVATE_KEY,
                "client_email": FIREBASE_CLIENT_EMAIL,
                "client_id": FIREBASE_CLIENT_ID,
                "auth_uri": FIREBASE_AUTH_URI,
                "token_uri": FIREBASE_TOKEN_URI,
                "auth_provider_x509_cert_url": FIREBASE_AUTH_PROVIDER_CERT_URL,
                "client_x509_cert_url": FIREBASE_CLIENT_CERT_URL,
            }
            cred = credentials.Certificate(service_account_info)
            _firebase_app = firebase_admin.initialize_app(cred)
        else:
            raise ValueError(
                "Firebase credentials not configured. "
                "Set either FIREBASE_SERVICE_ACCOUNT_PATH or "
                "FIREBASE_PROJECT_ID + FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL"
            )

    return _firebase_app


async def verify_firebase_token(id_token: str) -> dict:
    """Verify Firebase ID token and return decoded token info.

    Args:
        id_token: Firebase ID token from frontend

    Returns:
        Decoded token containing uid, email, etc.

    Raises:
        ValueError: If token is invalid or expired
    """
    try:
        # Initialize Firebase if not already done
        get_firebase_app()

        # Verify the ID token
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token
    except auth.InvalidIdTokenError:
        raise ValueError("Invalid Firebase ID token")
    except auth.ExpiredIdTokenError:
        raise ValueError("Firebase ID token has expired")
    except auth.RevokedIdTokenError:
        raise ValueError("Firebase ID token has been revoked")
    except Exception as e:
        raise ValueError(f"Token verification failed: {str(e)}")


async def get_firebase_user(uid: str) -> dict:
    """Get Firebase user by UID.

    Args:
        uid: Firebase user UID

    Returns:
        UserRecord object as dict
    """
    try:
        get_firebase_app()
        user = auth.get_user(uid)
        return {
            "uid": user.uid,
            "email": user.email,
            "email_verified": user.email_verified,
            "display_name": user.display_name,
            "photo_url": user.photo_url,
            "phone_number": user.phone_number,
            "disabled": user.disabled,
            "provider_data": [
                {
                    "provider_id": provider.provider_id,
                    "uid": provider.uid,
                    "email": provider.email,
                    "display_name": provider.display_name,
                    "photo_url": provider.photo_url,
                }
                for provider in user.provider_data
            ],
        }
    except auth.UserNotFoundError:
        raise ValueError(f"User not found: {uid}")
    except Exception as e:
        raise ValueError(f"Failed to get user: {str(e)}")
