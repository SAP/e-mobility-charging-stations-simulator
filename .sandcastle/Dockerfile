FROM node:24-trixie

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    jq \
    ca-certificates \
    gpg \
    && rm -rf /var/lib/apt/lists/*

# uv (griffo.io APT) — needed for uvx MCP servers
RUN mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://debian.griffo.io/EA0F721D231FDD3A0A17B9AC7808B4DD62C41256.asc \
       | gpg --dearmor -o /etc/apt/keyrings/debian.griffo.io.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/debian.griffo.io.gpg] https://debian.griffo.io/apt trixie main" \
       > /etc/apt/sources.list.d/debian.griffo.io.list \
    && apt-get update && apt-get install -y --no-install-recommends uv \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install coding agents globally
RUN npm install -g \
    @anthropic-ai/claude-code \
    @mariozechner/pi-coding-agent \
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
