from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

class InputTextBySelectorAction(BaseModel):
	selector: str
	text: str
	xpath: Optional[str] = None


class Position(BaseModel):
	x: int
	y: int
