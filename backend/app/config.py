from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "daily_entry_report"
    jwt_secret: str = "dev-secret-change-me"
    jwt_expire_minutes: int = 720
    cors_origins: str = "http://localhost:5173"

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_starttls: bool = True
    otp_expire_minutes: int = 10
    # Local time shown in emails, as minutes from UTC (330 = India, UTC+05:30).
    utc_offset_minutes: int = 330
    # Who receives "Request new course" emails (comma separated). Empty = every active Manager and Admin with an email.
    course_request_emails: str = "ranjit@vectratech.in,admin@vectratech.in"


settings = Settings()
