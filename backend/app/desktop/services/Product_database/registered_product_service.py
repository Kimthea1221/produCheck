from datetime import date, datetime, timezone
import sys
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func
from fastapi import HTTPException, status, Request, BackgroundTasks
from app.core.audit import write_audit_log, get_user_region_code
from app.core.constants import AuditAction
from app.desktop.services.auth.email import send_converted_product_email

from app.models.registered_products import RegisteredProduct
from app.models.unregistered_advisories import UnregisteredAdvisory
from app.models.users import User
from app.core.user_display import format_officer_display_name
from app.desktop.schemas.Product_database.registered_products import (
    RegisteredProductCreate,
    RegisteredProductUpdate
)
from app.desktop.services.Product_database.csv_sync import sync_registered_products_to_csv, sync_unregistered_advisories_to_csv


def auto_cleanup_expired_registered_products(db: Session):
    """
    Automatically soft-deletes registered products whose expiry_date <= today.
    Also ensures the CSV stays in sync.
    """
    try:
        today = date.today()
        expired_products = db.query(RegisteredProduct).filter(
            RegisteredProduct.deleted_at.is_(None),
            RegisteredProduct.expiry_date.isnot(None),
            RegisteredProduct.expiry_date <= today
        ).all()

        if expired_products:
            now = datetime.now(timezone.utc)
            fallback_user = db.query(User.user_id).first()
            fallback_user_id = fallback_user[0] if fallback_user else None

            for p in expired_products:
                p.deleted_at = now
                p.deleted_by = p.updated_by or p.added_by or fallback_user_id
            
            db.commit()
            sync_registered_products_to_csv(db)
    except Exception as e:
        db.rollback()
        print(f"Warning: Error in auto_cleanup_expired_registered_products: {e}", file=sys.stderr)


def increment_marketplace_detection_count(db: Session, product_id) -> bool:
    updated = db.query(RegisteredProduct).filter(
        RegisteredProduct.product_id == product_id,
        RegisteredProduct.deleted_at.is_(None),
    ).update(
        {
            RegisteredProduct.marketplace_detection_count:
            RegisteredProduct.marketplace_detection_count + 1,
        },
        synchronize_session=False,
    )
    if not updated:
        db.rollback()
        return False
    db.commit()
    return True


def format_product_response(product: RegisteredProduct, db: Session):
    added_by_user = None
    if product.added_by:
        added_by_user = db.query(User).filter(User.user_id == product.added_by).first()

    updated_by_user = None
    if product.updated_by:
        updated_by_user = db.query(User).filter(User.user_id == product.updated_by).first()

    return {
        "product_id": product.product_id,
        "product_name": product.product_name,
        "brand_name": product.brand_name,
        "registration_number": product.registration_number,
        "product_category": product.product_category,
        "registration_status": product.registration_status,
        "date_registered": product.date_registered,
        "expiry_date": product.expiry_date,
        "marketplace_detection_count": product.marketplace_detection_count,
        "added_by": format_officer_display_name(added_by_user) if added_by_user else None,
        "updated_by": format_officer_display_name(updated_by_user) if updated_by_user else None,
        "converted_from_advisory_id": product.converted_from_advisory_id,
        "created_at": product.created_at,
        "updated_at": product.updated_at,
    }


def get_all_registered_products(db: Session, current_user: User):
    auto_cleanup_expired_registered_products(db)

    AddedUser = aliased(User)
    UpdatedUser = aliased(User)

    query = db.query(
        RegisteredProduct,
        AddedUser,
        UpdatedUser
    ).outerjoin(
        AddedUser, RegisteredProduct.added_by == AddedUser.user_id
    ).outerjoin(
        UpdatedUser, RegisteredProduct.updated_by == UpdatedUser.user_id
    ).filter(
        RegisteredProduct.deleted_at.is_(None)
    )

    if current_user.role != "superadmin" and current_user.region_id:
        query = query.filter(
            (AddedUser.region_id == current_user.region_id) | (RegisteredProduct.added_by.is_(None))
        )

    results = query.order_by(
        RegisteredProduct.created_at.desc()
    ).all()

    formatted = []
    for product, added_user, updated_user in results:
        formatted.append({
            "product_id": product.product_id,
            "product_name": product.product_name,
            "brand_name": product.brand_name,
            "registration_number": product.registration_number,
            "product_category": product.product_category,
            "registration_status": product.registration_status,
            "date_registered": product.date_registered,
            "expiry_date": product.expiry_date,
            "marketplace_detection_count": product.marketplace_detection_count,
            "added_by": format_officer_display_name(added_user) if added_user else None,
            "updated_by": format_officer_display_name(updated_user) if updated_user else None,
            "converted_from_advisory_id": product.converted_from_advisory_id,
            "created_at": product.created_at,
            "updated_at": product.updated_at,
        })
    return formatted


def create_registered_product(db: Session, data: RegisteredProductCreate, current_user, request: Request = None):
    # Check duplicate product name
    existing_name = db.query(RegisteredProduct).filter(
        func.lower(RegisteredProduct.product_name) == func.lower(data.product_name),
        RegisteredProduct.deleted_at.is_(None)
    ).first()

    if existing_name:
        region_name = None
        if existing_name.added_by:
            creator = db.query(User).filter(User.user_id == existing_name.added_by).first()
            if creator and creator.region_id:
                from app.models.regions import Region
                region = db.query(Region).filter(Region.region_id == creator.region_id).first()
                if region:
                    region_name = region.region_name

        if region_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate product name detected. This product already exists in the database (Region: {region_name})."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Duplicate product name detected. This product already exists in the database."
            )

    existing = db.query(RegisteredProduct).filter(
        RegisteredProduct.registration_number == data.registration_number,
        RegisteredProduct.deleted_at.is_(None)
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration Number must be unique. This number already exists."
        )

    region_code = get_user_region_code(db, current_user)
    current_user_id = current_user.user_id
    current_user_role = current_user.role

    new_product = RegisteredProduct(
        product_name=data.product_name,
        brand_name=data.brand_name,
        registration_number=data.registration_number,
        product_category=data.product_category or "Cosmetics",
        date_registered=data.date_registered,
        expiry_date=data.expiry_date,
        added_by=current_user_id,
        updated_by=current_user_id,
    )

    db.add(new_product)
    db.commit()
    db.refresh(new_product)
    sync_registered_products_to_csv(db)

    write_audit_log(
        db,
        user=None,
        user_id_override=current_user_id,
        user_role_override=current_user_role,
        action=AuditAction.CREATE_REGISTERED_PRODUCT,
        target_table="registered_products",
        target_id=new_product.product_id,
        target_reference=new_product.product_name,
        new_value={
            "product_name": new_product.product_name,
            "registration_number": new_product.registration_number,
            "product_category": new_product.product_category,
        },
        request=request,
        region_code=region_code,
    )

    return format_product_response(new_product, db)


def update_registered_product(db: Session, product_id, data: RegisteredProductUpdate, current_user, request: Request = None):
    product = db.query(RegisteredProduct).filter(
        RegisteredProduct.product_id == product_id,
        RegisteredProduct.deleted_at.is_(None)
    ).first()

    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registered product not found."
        )

    # Check duplicate product name excluding current product
    existing_name = db.query(RegisteredProduct).filter(
        func.lower(RegisteredProduct.product_name) == func.lower(data.product_name),
        RegisteredProduct.product_id != product_id,
        RegisteredProduct.deleted_at.is_(None)
    ).first()

    if existing_name:
        region_name = None
        if existing_name.added_by:
            creator = db.query(User).filter(User.user_id == existing_name.added_by).first()
            if creator and creator.region_id:
                from app.models.regions import Region
                region = db.query(Region).filter(Region.region_id == creator.region_id).first()
                if region:
                    region_name = region.region_name

        if region_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate product name detected. This product already exists in the database (Region: {region_name})."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Duplicate product name detected. This product already exists in the database."
            )

    # Check unique constraint excluding current product
    existing = db.query(RegisteredProduct).filter(
        RegisteredProduct.registration_number == data.registration_number,
        RegisteredProduct.product_id != product_id,
        RegisteredProduct.deleted_at.is_(None)
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration Number must be unique. This number already exists."
        )

    old_value = {
        "product_name": product.product_name,
        "brand_name": product.brand_name,
        "registration_number": product.registration_number,
        "product_category": product.product_category,
    }
    region_code = get_user_region_code(db, current_user)
    current_user_id = current_user.user_id
    current_user_role = current_user.role

    product.product_name = data.product_name
    product.brand_name = data.brand_name
    product.registration_number = data.registration_number
    product.product_category = data.product_category or "Cosmetics"
    product.date_registered = data.date_registered
    product.expiry_date = data.expiry_date
    product.updated_by = current_user_id

    db.commit()
    db.refresh(product)
    sync_registered_products_to_csv(db)

    write_audit_log(
        db,
        user=None,
        user_id_override=current_user_id,
        user_role_override=current_user_role,
        action=AuditAction.UPDATE_REGISTERED_PRODUCT,
        target_table="registered_products",
        target_id=product.product_id,
        target_reference=product.product_name,
        old_value=old_value,
        new_value={
            "product_name": product.product_name,
            "brand_name": product.brand_name,
            "registration_number": product.registration_number,
            "product_category": product.product_category,
        },
        request=request,
        region_code=region_code,
    )

    return format_product_response(product, db)


def convert_advisory_to_product(db: Session, advisory_id, data: RegisteredProductCreate, current_user, request: Request = None, background_tasks: BackgroundTasks = None):
    advisory = db.query(UnregisteredAdvisory).filter(
        UnregisteredAdvisory.advisory_id == advisory_id,
        UnregisteredAdvisory.deleted_at.is_(None)
    ).first()

    if not advisory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unregistered advisory not found."
        )

    region_code = get_user_region_code(db, current_user)
    current_user_id = current_user.user_id if current_user else None
    current_user_role = current_user.role if current_user else None
    officer_email = current_user.email if current_user else None
    officer_first_name = current_user.first_name if current_user else None
    officer_last_name = current_user.last_name if current_user else None
    officer_name = " ".join(filter(None, [officer_first_name, officer_last_name])) or (officer_email or "FDA Officer")
    officer_position = current_user.position if current_user else "Inspection Officer"
    officer_agency = current_user.department if current_user else "Food and Drug Administration"
    officer_employee_id = current_user.employee_id if current_user else "-"

    source_advisory_name = advisory.product_name

    # Soft delete the advisory
    advisory.deleted_at = func.now()
    advisory.deleted_by = current_user_id

    # Create new registered product
    new_product = RegisteredProduct(
        product_name=data.product_name,
        brand_name=data.brand_name,
        registration_number=data.registration_number,
        product_category=data.product_category or "Cosmetics",
        date_registered=data.date_registered,
        expiry_date=data.expiry_date,
        converted_from_advisory_id=advisory_id,
        added_by=current_user_id,
        updated_by=current_user_id,
    )

    db.add(new_product)
    db.commit()
    db.refresh(new_product)
    sync_registered_products_to_csv(db)
    sync_unregistered_advisories_to_csv(db)

    write_audit_log(
        db,
        user=None,
        user_id_override=current_user_id,
        user_role_override=current_user_role,
        action=AuditAction.CONVERT_TO_REGISTERED_PRODUCT,
        target_table="registered_products",
        target_id=new_product.product_id,
        target_reference=new_product.product_name,
        old_value={"source_advisory_id": str(advisory_id), "source_advisory_name": source_advisory_name},
        new_value={
            "product_name": new_product.product_name,
            "registration_number": new_product.registration_number,
            "product_category": new_product.product_category,
        },
        request=request,
        region_code=region_code,
    )

    # Schedule email notification to the officer
    if background_tasks and officer_email:
        background_tasks.add_task(
            send_converted_product_email,
            to_email=officer_email,
            product_name=new_product.product_name,
            previous_classification="Unregistered/Advisory",
            new_classification="Registered",
            registration_number=new_product.registration_number or "-",
            manufacturer=new_product.brand_name or "-",
            category=new_product.product_category or "Cosmetics",
            officer_name=officer_name,
            officer_position=officer_position or "Inspection Officer",
            officer_agency=officer_agency or "Food and Drug Administration",
            officer_employee_id=officer_employee_id or "-",
            advisory_details=None,
            source_url=None,
        )

    return format_product_response(new_product, db)


def delete_registered_product(db: Session, product_id, current_user, request: Request = None):
    product = db.query(RegisteredProduct).filter(
        RegisteredProduct.product_id == product_id,
        RegisteredProduct.deleted_at.is_(None)
    ).first()

    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registered product not found."
        )

    region_code = get_user_region_code(db, current_user)
    current_user_id = current_user.user_id
    current_user_role = current_user.role
    old_value = {
        "product_name": product.product_name,
        "registration_number": product.registration_number,
    }

    product.deleted_at = func.now()
    product.deleted_by = current_user_id

    db.commit()
    sync_registered_products_to_csv(db)

    write_audit_log(
        db,
        user=None,
        user_id_override=current_user_id,
        user_role_override=current_user_role,
        action=AuditAction.DELETE_REGISTERED_PRODUCT,
        target_table="registered_products",
        target_id=product.product_id,
        target_reference=old_value["product_name"],
        old_value=old_value,
        request=request,
        region_code=region_code,
    )

    return {"message": "Product deleted successfully."}