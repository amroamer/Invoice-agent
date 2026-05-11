from enum import Enum


class UserRole(str, Enum):
    officer = "officer"
    admin = "admin"


class ProjectStatus(str, Enum):
    active = "active"
    on_hold = "on_hold"
    closed = "closed"
    inactive = "inactive"


class VatTreatment(str, Enum):
    inclusive = "inclusive"
    exclusive = "exclusive"
    exempt = "exempt"


class InvoiceSource(str, Enum):
    historical = "historical"
    uploaded = "uploaded"


class InvoiceStatus(str, Enum):
    pending = "pending"
    reviewed = "reviewed"
    decided = "decided"
    paid = "paid"
    partially_paid = "partially_paid"
    rejected = "rejected"


class PaymentStatus(str, Enum):
    unpaid = "unpaid"
    partially_paid = "partially_paid"
    paid = "paid"


class MatchStatus(str, Enum):
    proposed = "proposed"
    confirmed = "confirmed"
    rejected = "rejected"


class FindingSeverity(str, Enum):
    info = "info"
    warning = "warning"
    blocker = "blocker"


class Scenario(str, Enum):
    happy = "happy"
    conditional = "conditional"
    do_not_pay = "do_not_pay"
