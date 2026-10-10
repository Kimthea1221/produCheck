"""add request_id to shared_files

Revision ID: c340a780b735
Revises: beeb6c0d1081
Create Date: 2026-10-10 21:52:51.222690

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c340a780b735'
down_revision: Union[str, Sequence[str], None] = 'beeb6c0d1081'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('shared_files', sa.Column('request_id', sa.UUID(), nullable=True))
    # CHANGED: explicit name, so downgrade() can drop it (autogenerate left it as None)
    op.create_foreign_key(
        op.f('shared_files_request_id_fkey'), 'shared_files', 'verification_requests',
        ['request_id'], ['request_id'], ondelete='CASCADE',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f('shared_files_request_id_fkey'), 'shared_files', type_='foreignkey')  # CHANGED: named
    op.drop_column('shared_files', 'request_id')
