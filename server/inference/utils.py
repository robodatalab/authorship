from huggingface_hub import snapshot_download
from huggingface_hub.errors import LocalEntryNotFoundError


def is_huggingface_model_downloaded(model_id: str) -> bool:
    """Ask the hub whether every file is already local."""
    try:
        snapshot_download(model_id, local_files_only=True)
        return True
    except LocalEntryNotFoundError:
        return False
