FROM node:24-trixie

RUN apt-get update && apt-get install -y \
    git \
    curl \
    jq \
    ca-certificates \
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
    && chown -R ${AGENT_UID}:${AGENT_UID} /home/agent
USER agent

WORKDIR /home/agent
ENTRYPOINT ["sleep", "infinity"]
