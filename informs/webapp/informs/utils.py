import uuid


def takuid_new():
    random_uuid = uuid.uuid4().hex[:32]
    tak_uid = f"{random_uuid[:8]}-{random_uuid[8:12]}-{random_uuid[12:16]}-{random_uuid[16:20]}-{random_uuid[20:]}"
    return tak_uid
