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
    # Values for the template's {{1}}, {{2}} ... in order. Names: employee, code, employeeCode, course,
    # courseId, remarks, date, email. Must match the number of variables in the approved template.
    wa_template_params: str = "employee,code,course,courseId,remarks"

    # Missing daily entries: make an employee inactive after N working days with no entry (app/auto_inactive.py).
    auto_inactive_enabled: bool = True  # run once a day inside the API; false = use cron / Task Scheduler only
    auto_inactive_time: str = "06:00"  # local time (UTC_OFFSET_MINUTES) of the daily run
    auto_inactive_days: int = 3  # consecutive working days without any entry
    auto_inactive_roles: str = "FACULTY"  # only Faculty; Manager, Admin, HR and Staff are never checked
    auto_inactive_weekly_off: str = "6"  # weekday numbers that are off: 0=Mon ... 6=Sun ("5,6" = Sat and Sun)
    auto_inactive_holidays: str = ""  # YYYY-MM-DD dates, comma separated
    auto_inactive_start_date: str = ""  # first day that counts; empty = the day the feature first started


settings = Settings()
