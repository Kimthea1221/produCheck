from sqlalchemy import text

def format_officer_display_name(user) -> str | None:
    """
    Builds "Position FirstName LastName" (e.g. "PO3 R. Dela Cruz") from
    a User row. Any of the three parts can be null or empty — officers can be
    invited but not fully set up yet — so only present parts are
    joined. Falls back to user.email if position/first_name/last_name
    are all missing or empty, so the UI never shows a bare "N/A" when there's
    at least an email on file. Returns None only if there's no valid user
    name or email.
    """
    if not user:
        return None

    parts = []
    for part in (getattr(user, "position", None), getattr(user, "first_name", None), getattr(user, "last_name", None)):
        if part and isinstance(part, str) and part.strip():
            parts.append(part.strip())

    if parts:
        return " ".join(parts)

    email = getattr(user, "email", None)
    if email and isinstance(email, str) and email.strip():
        return email.strip()

    return None


# ADDED — RLS hides other-agency users, so FDA can't see LEA names and vice versa.
# Bypass is turned on for this one lookup only, and the previous value is restored after.
# Callers must already have checked the record belongs to the officer's region.
def get_display_name_across_agencies(db, user_id) -> str | None:
    if user_id is None:
        return None
    from app.models.users import User  # local import avoids circular imports
    previous = db.execute(text("SELECT current_setting('app.bypass_rls', true)")).scalar()
    db.execute(text("SELECT set_config('app.bypass_rls', 'true', true)"))
    try:
        user = db.query(User).filter(User.user_id == user_id).first()
        return format_officer_display_name(user)
    finally:
        db.execute(
            text("SELECT set_config('app.bypass_rls', :v, true)"),
            {"v": previous or "false"},
        )