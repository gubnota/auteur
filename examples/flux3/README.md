# FLUX.3 Klein designer demo families

User-supplied original GUI workflows are retained unchanged as parsed JSON. Two families contain three independent variants each: T4 16 GB, RTX 3090 24 GB, Apple Silicon. The six JSON files are not API exports. The utility compiles them against the selected live registry.

`catalogue.json` binds controls, immutable model hashes/bytes/revision, guide, example images and idempotent Check/Install/Verify scripts. The agent performs model downloads and API preparation; no manual notebook model installation is needed. Model access requires upstream license acceptance and node-local Hugging Face authentication. No weights or credentials are included.

Primary sources verified 2026-10-15: https://github.com/Comfy-Org/ComfyUI/pull/17064 and https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy . Upstream merge: 20b46065ef7f34fa21e8abebe8d0cca90a904d6d. Model revision: 3700a1012ec75ad50a54e92199f85ba7cba93c1e. GPU generation remains unverified. The included pictures are input illustrations.

Export either family as `.mymovie-workflow`: the compressed package contains all three complete graph variants and their wrappers. Complete graphs preserve original hashes and avoid fragile array-index patches; ZIP compression reduces repeated metadata. No external base graph is required to import it.
