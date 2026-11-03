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
    # Batch import (Master › Batch Import): folder or file holding the BatchMaster table (.accdb, .mdb, .xlsx or .csv).
    # Empty = use the path saved on the Batch Import page.
    batch_import_path: str = r"\\192.168.0.129\Test\DAILY_REPORT_SOFTWARE_2026"
    batch_import_table: str = "BatchMaster"  # table name inside an Access file
    # Automatic import once a month: on this day of the month (1-28; 0 = off), at or after this local hour.
    batch_import_day: int = 1
    batch_import_hour: int = 6


settings = Settings()
