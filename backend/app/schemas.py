from pydantic import BaseModel, model_validator


class Form(BaseModel):
    """Request body from a form: an empty text box on an optional field means "not given"."""

    @model_validator(mode="before")
    @classmethod
    def _blank_to_none(cls, data):
        if isinstance(data, dict):
            optional = {n for n, f in cls.model_fields.items() if not f.is_required() and f.default is None}
            return {k: (None if k in optional and isinstance(v, str) and not v.strip() else v) for k, v in data.items()}
        return data
