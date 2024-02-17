<template>
  <h2>Action Add Charging Stations</h2>
</template>

<script setup lang="ts">
import { getCurrentInstance, onMounted } from 'vue'

const app = getCurrentInstance()
const uiClient = app?.appContext.config.globalProperties.$uiClient

onMounted(() => {
  uiClient.listTemplates().then((response: ResponsePayload) => {
    if (app != null && app.appContext.config.globalProperties.$templates == null) {
      app.appContext.config.globalProperties.$templates = response.templates
    }
  })
})
</script>

<style></style>
