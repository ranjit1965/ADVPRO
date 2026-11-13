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
    # WhatsApp (Pinbot) message sent with every course request; see app/whatsapp.py. Empty = no WhatsApp.
    wa_api_base: str = "https://partnersv1.pinbot.ai/v3"
    wa_api_key: str = ""
    wa_phone_number_id: str = ""
    wa_template_id: str = ""
    wa_template_name: str = ""
    wa_template_lang: str = "en"
    wa_notify_numbers: str = ""  # Manager and Admin numbers with country code, comma separated


settings = Settings()
