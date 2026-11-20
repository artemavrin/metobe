# The box the model's code runs in (D47): Python with tables, documents, slides, PDF and charts; no network at run time.
# Built by the release CI as ghcr.io/artemavrin/metobe-sandbox; the sandbox service runs it read-only under gVisor.
FROM python:3.13-slim

# Fonts with Cyrillic for charts, documents and PDF; poppler and tesseract (Russian, English) to read scanned PDFs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-dejavu-core fonts-liberation \
    poppler-utils tesseract-ocr tesseract-ocr-rus tesseract-ocr-eng \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
  && rm /tmp/requirements.txt \
  # matplotlib's font cache, built now: at run time the home is read-only.
  && MPLCONFIGDIR=/opt/matplotlib python -c "import matplotlib.pyplot" \
  && chmod -R a+rX /opt/matplotlib

# matplotlib's cache is copied to /tmp at start: it wants to write next to it, and the image is read-only.
# One thread per library: the box has one core, and OpenBLAS reserving memory per thread trips the address-space cap.
ENV MPLCONFIGDIR=/tmp/matplotlib \
    MPLBACKEND=Agg \
    OPENBLAS_NUM_THREADS=1 \
    OMP_NUM_THREADS=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/tmp

USER 1000:1000
WORKDIR /workspace
CMD ["sh", "-c", "cp -r /opt/matplotlib /tmp/matplotlib && exec sleep infinity"]
