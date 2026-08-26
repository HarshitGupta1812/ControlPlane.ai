from slowapi import Limiter
from slowapi.util import get_remote_address

# A conservative default protects every decorated public surface; sensitive
# routes use tighter per-endpoint limits.
limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])
