PROJECT_NAME?=evse
NAME:=e-mobility-charging-stations-simulator
SUBMODULES_INIT?=false
DOCKER_ECR_ACCOUNT_ID?=166296450311
DOCKER_ECR_REGION?=eu-west-3
DOCKER_ECR_REGISTRY_NAME?=e-mobility-charging-stations-simulator
DOCKER_ECR_TAG?=latest

.PHONY: all

default: all

submodule-update:
	git submodule update --init --recursive

submodules-init=
ifeq '$(SUBMODULES_INIT)' 'true'
	submodules-init += submodule-update
endif

$(NAME): $(submodules-init)
	docker compose -p $(PROJECT_NAME) up -d

$(NAME)-force: $(submodules-init)
	docker compose -p $(PROJECT_NAME) up -d --build --force-recreate

all: $(NAME)

clean-images:
	-docker rmi $(PROJECT_NAME)-$(NAME)

clean-containers:
	-docker compose -p $(PROJECT_NAME) down

clean: clean-containers clean-images

docker-tag-ecr:
	docker tag $(PROJECT_NAME)-$(NAME) $(DOCKER_ECR_ACCOUNT_ID).dkr.ecr.$(DOCKER_ECR_REGION).amazonaws.com/$(DOCKER_ECR_REGISTRY_NAME):$(DOCKER_ECR_TAG)

docker-push-ecr: $(NAME)-force docker-tag-ecr
	aws ecr get-login-password --region $(DOCKER_ECR_REGION) | docker login --username AWS --password-stdin $(DOCKER_ECR_ACCOUNT_ID).dkr.ecr.$(DOCKER_ECR_REGION).amazonaws.com/$(DOCKER_ECR_REGISTRY_NAME)
	docker push $(DOCKER_ECR_ACCOUNT_ID).dkr.ecr.$(DOCKER_ECR_REGION).amazonaws.com/$(DOCKER_ECR_REGISTRY_NAME):$(DOCKER_ECR_TAG)

dist-clean-images:
	docker image prune -a -f

dist-clean-volumes:
	docker volume prune -f

dist-clean: clean-containers dist-clean-volumes dist-clean-images
