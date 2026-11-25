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
    # Who receives "Request new course" emails (comma separated). Empty = every active Super Admin and Admin with an email.
    course_request_emails: str = "ranjit@vectratech.in,admin@vectratech.in"
    # WhatsApp (Pinbot) message sent with every course request; see app/whatsapp.py. Empty = no WhatsApp.
    wa_api_base: str = "https://partnersv1.pinbot.ai/v3"
    wa_api_key: str = ""
    wa_phone_number_id: str = ""
    wa_template_id: str = ""
    wa_template_name: str = ""
    wa_template_lang: str = "en"
    wa_notify_numbers: str = ""  # Super Admin and Admin numbers with country code, comma separated
    # Values for the template's {{1}}, {{2}} ... in order. Names: employee, code, employeeCode, course,
    # courseId, remarks, date, email. Must match the number of variables in the approved template.
    wa_template_params: str = "employee,code,course,courseId,remarks"
    # Issue alert (entry saved with "Issue faced? Yes"): its own approved template, because a template's text is
    # fixed by WhatsApp. Empty name = no WhatsApp for issues (the email still goes). Names for the params:
    # faculty, code, place, activity, date, time, course, issueType, minutes, details, entryId.
    wa_issue_template_name: str = ""
    wa_issue_template_lang: str = ""  # empty = WA_TEMPLATE_LANG
    wa_issue_template_params: str = "faculty,code,place,date,issueType,minutes,details"
    # v59: birthday / anniversary wishes to an external faculty (button on Master › External Faculty on the day).
    # Each needs its own approved template. Names for the params: name, date, years, phone.
    wa_birthday_template_name: str = ""
    wa_birthday_template_lang: str = ""  # empty = WA_TEMPLATE_LANG
    wa_birthday_template_params: str = "name"
    wa_anniversary_template_name: str = ""
    wa_anniversary_template_lang: str = ""
    wa_anniversary_template_params: str = "name"
    celebration_reminder_days: int = 10  # HR sees the pop-up this many days before
    # v60: the message sent on the 4th morning, before the missing-entry check makes someone inactive.
    # Names for the params: name, code, employeeId, days, count, date.
    wa_inactive_template_name: str = ""
    wa_inactive_template_lang: str = ""
    wa_inactive_template_params: str = "name,days"

    # Missing daily entries: make an employee inactive after N working days with no entry (app/auto_inactive.py).
    # HR › Certification Status: carry unfinished certifications to the next quarter and email the Deferred Report.
    cert_followup_enabled: bool = True  # run once a day inside the API
    cert_followup_time: str = "07:00"  # local time of the daily run
    auto_inactive_enabled: bool = True  # run once a day inside the API; false = use cron / Task Scheduler only
    auto_inactive_time: str = "06:00"  # local time (UTC_OFFSET_MINUTES) of the daily run
    auto_inactive_days: int = 3  # consecutive working days without any entry
    auto_inactive_roles: str = "FACULTY"  # not used any more: the job checks only FACULTY (fixed in auto_inactive.py)
    auto_inactive_weekly_off: str = "6"  # weekday numbers that are off: 0=Mon ... 6=Sun ("5,6" = Sat and Sun)
    auto_inactive_holidays: str = ""  # YYYY-MM-DD dates, comma separated
    auto_inactive_start_date: str = ""  # first day that counts; empty = the day the feature first started


settings = Settings()
