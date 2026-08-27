import base64
import hashlib
import secrets

from cryptography.fernet import Fernet, InvalidToken


def generate_secret(byte_count: int = 32) -> str:
    return secrets.token_urlsafe(byte_count)


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def secrets_match(value: str, expected_hash: str) -> bool:
    return secrets.compare_digest(hash_secret(value), expected_hash)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, encoded: str) -> bool:
    if not encoded:
        return False
    try:
        algorithm, salt_text, digest_text = encoded.split("$", 2)
        if algorithm != "scrypt":
            return False
        salt = base64.b64decode(salt_text, validate=True)
        expected = base64.b64decode(digest_text, validate=True)
        actual = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
        return secrets.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def encrypt_secret(value: str, encryption_key: str) -> str:
    if not encryption_key:
        raise RuntimeError("CC_SECRET_ENCRYPTION_KEY is required")
    try:
        return Fernet(encryption_key.encode("ascii")).encrypt(value.encode("utf-8")).decode("ascii")
    except (ValueError, UnicodeEncodeError) as exc:
        raise RuntimeError("CC_SECRET_ENCRYPTION_KEY is invalid") from exc


def decrypt_secret(value: str, encryption_key: str) -> str:
    if not encryption_key:
        raise RuntimeError("CC_SECRET_ENCRYPTION_KEY is required")
    try:
        return Fernet(encryption_key.encode("ascii")).decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, UnicodeError) as exc:
        raise RuntimeError("unable to decrypt OAuth secret") from exc
