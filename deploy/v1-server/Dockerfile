# 第一阶段只负责构建网页 CSS；Node.js 不进入最终运行镜像。
# 标签说明版本，@sha256 固定具体基础镜像；升级时一起更新。
FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS styles
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY tailwind.config.js ./
COPY templates ./templates
COPY static ./static
# 使用仓库相对路径，覆盖旧配置中可能存在的开发电脑绝对路径。
RUN npm run build:css -- --content './templates/**/*.html,./static/js/**/*.js,./node_modules/flowbite/**/*.js'

# 第二阶段是实际服务器：只有 Python、运行依赖、程序和构建好的网页资源。
FROM python:3.12-slim-bookworm@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258
ARG V1_REVISION
LABEL org.opencontainers.image.revision="${V1_REVISION}" \
      org.opencontainers.image.source="https://github.com/ma-jiale/Pillxa-Dispener"
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt requirements-deploy.txt ./
RUN python -m pip install --no-cache-dir -r requirements-deploy.txt && python -m pip check
COPY main.py run_server.py check_health.py check_web.py REVISION ./
COPY templates ./templates
COPY --from=styles /build/static ./static
# 运行时这两个目录会挂载学校服务器上的持久数据，不把业务数据写进镜像。
RUN mkdir -p /app/data /app/static/images
USER 10001:10001
EXPOSE 5068
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD ["python", "check_health.py"]
CMD ["python", "run_server.py"]
