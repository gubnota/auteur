FROM python:3.12-slim@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1
ARG COMFY_COMMIT=30c259cac8c08ff8d015f9aff3151cb525c9b702
RUN apt-get update && apt-get install -y --no-install-recommends git libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/comfy
RUN git init . && git remote add origin https://github.com/Comfy-Org/ComfyUI.git && git fetch --depth 1 origin ${COMFY_COMMIT} && git checkout --detach FETCH_HEAD && test "$(git rev-parse HEAD)" = "${COMFY_COMMIT}" && rm -rf .git
COPY python.lock.txt /opt/python.lock.txt
RUN pip install --no-cache-dir -r /opt/python.lock.txt && pip check
RUN useradd --create-home --uid 10001 studio && chown -R studio:studio /opt/comfy
USER studio
EXPOSE 8188
CMD ["python", "main.py", "--cpu", "--listen", "0.0.0.0", "--port", "8188", "--disable-auto-launch"]
