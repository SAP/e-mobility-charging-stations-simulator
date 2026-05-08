FROM node:24-trixie

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    jq \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# uv
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://debian.griffo.io/EA0F721D231FDD3A0A17B9AC7808B4DD62C41256.asc \
       -o /etc/apt/keyrings/debian.griffo.io.asc \
    && chmod a+r /etc/apt/keyrings/debian.griffo.io.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/debian.griffo.io.asc] https://debian.griffo.io/apt trixie main" \
       > /etc/apt/sources.list.d/debian.griffo.io.list \
    && apt-get update && apt-get install -y --no-install-recommends uv \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
       -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && chmod a+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Install coding agents globally
RUN npm install -g \
    @anthropic-ai/claude-code \
    @earendil-works/pi-coding-agent \
    opencode-ai

# Rename the base image's "node" user to "agent" and align UID/GID.
# Default 1001 matches GitHub Actions runner UID (ubuntu-latest since May 2025).
# On macOS, build with --build-arg AGENT_UID=$(id -u) to match host UID.
ARG AGENT_UID=1001
RUN usermod -u ${AGENT_UID} -d /home/agent -m -l agent node \
    && groupmod -g ${AGENT_UID} -n agent node \
    && mkdir -p /home/agent/.local/share/pnpm/store \
               /home/agent/.local/share/opencode \
    && chown -R ${AGENT_UID}:${AGENT_UID} /home/agent
USER agent

WORKDIR /home/agent
ENTRYPOINT ["sleep", "infinity"]
