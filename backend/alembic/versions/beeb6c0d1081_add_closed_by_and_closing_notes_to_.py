"""add closed_by and closing_notes to complaints

Revision ID: beeb6c0d1081
Revises: 83794764a483
Create Date: 2026-10-10 21:15:15.448444

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'beeb6c0d1081'
down_revision: Union[str, Sequence[str], None] = '83794764a483'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('complaints', sa.Column('closed_by', sa.UUID(), nullable=True))
    op.add_column('complaints', sa.Column('closing_notes', sa.Text(), nullable=True))
    # CHANGED: explicit name, so downgrade() can drop it (autogenerate left it as None)
    op.create_foreign_key(
        op.f('complaints_closed_by_fkey'), 'complaints', 'users',
        ['closed_by'], ['user_id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f('complaints_closed_by_fkey'), 'complaints', type_='foreignkey')  # CHANGED: named
    op.drop_column('complaints', 'closing_notes')
    op.drop_column('complaints', 'closed_by')
