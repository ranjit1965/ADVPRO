"""Outgoing email (manager verification code, course requests). A real SMTP server is required."""
import logging
import smtplib
import ssl
from email.message import EmailMessage

from .config import settings

log = logging.getLogger("der.mail")


class MailNotConfigured(RuntimeError):
    pass


def smtp_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_from)


def send_mail(to: list[str] | str, subject: str, text: str, reply_to: str | None = None) -> None:
    """Sends a plain-text email through the SMTP server in backend/.env. Raises MailNotConfigured or an SMTP error."""
    if not smtp_configured():
        raise MailNotConfigured("Email is not set up on the server. Fill in SMTP_HOST, SMTP_USER, SMTP_PASSWORD and SMTP_FROM in backend/.env.")
    recipients = [to] if isinstance(to, str) else list(to)
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = ", ".join(recipients)
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(text)
    ctx = ssl.create_default_context()
    if settings.smtp_port == 465:  # implicit TLS
        server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20, context=ctx)
    else:
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
    with server as s:
        if settings.smtp_port != 465 and settings.smtp_starttls:
            s.starttls(context=ctx)
        if settings.smtp_user:
            s.login(settings.smtp_user, settings.smtp_password)
        s.send_message(msg)
    log.info("Mail '%s' sent to %s", subject, ", ".join(recipients))


def send_reset_otp(to: str, name: str, code: str) -> None:
    """Emails the 6-digit code for the manager's Forgot password."""
    send_mail(
        to,
        "Daily Entry Report: password reset code",
        f"Hello {name},\n\nYour password reset code is {code}.\n"
        f"It expires in {settings.otp_expire_minutes} minutes.\n\n"
        "If you did not ask to reset your password, ignore this email; your password stays the same.",
    )


def send_otp(to: str, name: str, code: str) -> None:
    """Emails the 6-digit manager sign-up code."""
    send_mail(
        to,
        "Daily Entry Report: manager account verification code",
        f"Hello {name},\n\nYour verification code is {code}.\n"
        f"It expires in {settings.otp_expire_minutes} minutes.\n\n"
        "If you did not request this, ignore this email.",
    )
