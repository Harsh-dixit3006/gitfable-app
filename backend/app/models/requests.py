import re
from pydantic import BaseModel, Field, field_validator, HttpUrl
from typing import List, Optional


# Constants for validation
MAX_USERNAME_LENGTH = 39  # GitHub username max length
MIN_USERNAME_LENGTH = 2
MAX_URL_LENGTH = 2048
MAX_LANGUAGES = 20
MAX_DIFFICULTIES = 5
ALLOWED_DIFFICULTIES = {"Beginner", "Intermediate", "Advanced"}
MAX_LIST_ITEM_LENGTH = 50


class LoginRequest(BaseModel):
    """Login request with GitHub username validation."""

    username: str = Field(
        ...,
        min_length=MIN_USERNAME_LENGTH,
        max_length=MAX_USERNAME_LENGTH,
        description="GitHub username (2-39 characters, alphanumeric with hyphens)",
    )

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        """Validate GitHub username format."""
        v = v.strip()

        # GitHub username rules: alphanumeric and hyphens only, no consecutive hyphens,
        # cannot start/end with hyphen
        if not re.match(r"^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$", v):
            raise ValueError(
                "Username must contain only alphanumeric characters and hyphens, "
                "and cannot start or end with a hyphen"
            )

        # Check for consecutive hyphens
        if "--" in v:
            raise ValueError("Username cannot contain consecutive hyphens")

        return v.lower()  # Normalize to lowercase


class DrawRequest(BaseModel):
    """Draw request with filter validation."""

    languages: List[str] = Field(
        default=[],
        max_length=MAX_LANGUAGES,
        description="List of programming languages to filter by",
    )
    difficulties: List[str] = Field(
        default=[],
        max_length=MAX_DIFFICULTIES,
        description="List of difficulty levels to filter by",
    )

    @field_validator("languages")
    @classmethod
    def validate_languages(cls, v: List[str]) -> List[str]:
        """Validate language filters."""
        if len(v) > MAX_LANGUAGES:
            raise ValueError(f"Cannot filter by more than {MAX_LANGUAGES} languages")

        validated = []
        for lang in v:
            lang = lang.strip()
            if not lang:
                continue
            if len(lang) > MAX_LIST_ITEM_LENGTH:
                raise ValueError(
                    f"Language name too long (max {MAX_LIST_ITEM_LENGTH} characters)"
                )
            # Remove any potentially dangerous characters
            if not re.match(r"^[a-zA-Z0-9+#\-. ]+$", lang):
                raise ValueError(f"Invalid characters in language name: {lang}")
            validated.append(lang)

        return validated

    @field_validator("difficulties")
    @classmethod
    def validate_difficulties(cls, v: List[str]) -> List[str]:
        """Validate difficulty filters."""
        if len(v) > MAX_DIFFICULTIES:
            raise ValueError(
                f"Cannot filter by more than {MAX_DIFFICULTIES} difficulties"
            )

        validated = []
        for diff in v:
            diff = diff.strip()
            if not diff:
                continue
            if diff not in ALLOWED_DIFFICULTIES:
                raise ValueError(
                    f"Invalid difficulty: {diff}. "
                    f"Must be one of: {', '.join(sorted(ALLOWED_DIFFICULTIES))}"
                )
            validated.append(diff)

        return validated


class ChooseIssueRequest(BaseModel):
    """Choose issue request with validation."""

    issue_id: str = Field(
        ..., min_length=1, max_length=50, description="Issue UUID to choose"
    )

    @field_validator("issue_id")
    @classmethod
    def validate_issue_id(cls, v: str) -> str:
        """Validate issue ID format (UUID-like)."""
        v = v.strip()

        # Basic UUID format validation (with some flexibility for different UUID versions)
        if not re.match(
            r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
            v,
        ):
            raise ValueError("Invalid issue ID format")

        return v.lower()


class SubmitPRRequest(BaseModel):
    """Submit PR request with GitHub PR URL validation."""

    pr_url: str = Field(
        ...,
        min_length=1,
        max_length=MAX_URL_LENGTH,
        description="GitHub pull request URL",
    )

    @field_validator("pr_url")
    @classmethod
    def validate_pr_url(cls, v: str) -> str:
        """Validate GitHub PR URL format."""
        v = v.strip()

        if len(v) > MAX_URL_LENGTH:
            raise ValueError(f"URL too long (max {MAX_URL_LENGTH} characters)")

        # GitHub PR URL pattern: https://github.com/{owner}/{repo}/pull/{number}
        github_pr_pattern = (
            r"^https://github\.com/[a-zA-Z0-9-]+/[a-zA-Z0-9._-]+/pull/\d+$"
        )

        if not re.match(github_pr_pattern, v):
            raise ValueError(
                "Invalid GitHub PR URL. Expected format: "
                "https://github.com/{owner}/{repo}/pull/{number}"
            )

        return v


class FilterUpdate(BaseModel):
    """Filter update request with validation."""

    languages: List[str] = Field(
        default=[],
        max_length=MAX_LANGUAGES,
        description="List of preferred programming languages",
    )
    difficulties: List[str] = Field(
        default=[],
        max_length=MAX_DIFFICULTIES,
        description="List of preferred difficulty levels",
    )

    @field_validator("languages")
    @classmethod
    def validate_languages(cls, v: List[str]) -> List[str]:
        """Validate language filters."""
        if len(v) > MAX_LANGUAGES:
            raise ValueError(f"Cannot have more than {MAX_LANGUAGES} languages")

        validated = []
        for lang in v:
            lang = lang.strip()
            if not lang:
                continue
            if len(lang) > MAX_LIST_ITEM_LENGTH:
                raise ValueError(
                    f"Language name too long (max {MAX_LIST_ITEM_LENGTH} characters)"
                )
            if not re.match(r"^[a-zA-Z0-9+#\-. ]+$", lang):
                raise ValueError(f"Invalid characters in language name: {lang}")
            validated.append(lang)

        return validated

    @field_validator("difficulties")
    @classmethod
    def validate_difficulties(cls, v: List[str]) -> List[str]:
        """Validate difficulty filters."""
        if len(v) > MAX_DIFFICULTIES:
            raise ValueError(f"Cannot have more than {MAX_DIFFICULTIES} difficulties")

        validated = []
        for diff in v:
            diff = diff.strip()
            if not diff:
                continue
            if diff not in ALLOWED_DIFFICULTIES:
                raise ValueError(
                    f"Invalid difficulty: {diff}. "
                    f"Must be one of: {', '.join(sorted(ALLOWED_DIFFICULTIES))}"
                )
            validated.append(diff)

        return validated


# Firebase Auth Request Models


class CreateUserRequest(BaseModel):
    """Request to create a new user in our database after Firebase Auth."""

    firebase_uid: str = Field(..., description="Firebase user UID")
    email: str = Field(..., description="User email address")
    username: str = Field(
        ...,
        min_length=MIN_USERNAME_LENGTH,
        max_length=MAX_USERNAME_LENGTH,
        description="Unique username (2-39 chars, alphanumeric and hyphens only)",
    )
    display_name: Optional[str] = Field(
        None, description="Display name (defaults to username)"
    )
    photo_url: Optional[str] = Field(None, description="Profile photo URL")

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        """Validate username format."""
        v = v.strip().lower()

        if not re.match(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", v):
            raise ValueError(
                "Username must contain only lowercase letters, numbers, and hyphens, "
                "and cannot start or end with a hyphen"
            )

        if "--" in v:
            raise ValueError("Username cannot contain consecutive hyphens")

        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        """Validate email format."""
        v = v.strip().lower()

        # Basic email validation
        if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", v):
            raise ValueError("Invalid email format")

        return v


class UpdateUserRequest(BaseModel):
    """Request to update user profile."""

    display_name: Optional[str] = Field(None, description="New display name")
    avatar_url: Optional[str] = Field(None, description="New avatar URL")
    filters: Optional[FilterUpdate] = Field(None, description="New filter preferences")
