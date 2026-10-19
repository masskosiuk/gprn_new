# Free Upload Capacity

Every account can store up to 40 non-deleted portfolio files, with photographs and videos sharing the same free capacity. Tiers and administrator roles do not change this number. Avatars and profile covers are excluded; profile images cannot be renamed into portfolio works. Deleted work frees a slot. Pre-existing accounts above 40 keep their files and can delete normally, but cannot add new portfolio files until below 40.

The upload endpoint checks capacity before image/video processing and checks again under the existing per-account upload transaction lock before insertion. Concurrent requests cannot claim the same final slot. Failed uploads clean only the three newly generated object keys, after all writes have settled. An account at capacity receives `PHOTO_STORAGE_LIMIT`, displayed as a localized limit message by the upload dialog.

No database migration or paid subscription is required for the upload limit itself. Battle-round deployment in the same release does require migration `0018_battle_rounds`.
