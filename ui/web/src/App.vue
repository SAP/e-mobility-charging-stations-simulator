<template>
  <router-view />
  <Container
    v-show="$route.name !== 'charging-stations' && $route.name !== 'not-found'"
    id="action-container"
  >
    <router-view name="action" />
  </Container>
</template>

<script setup lang="ts">
import Container from '@/components/Container.vue'
</script>

<style>
#app {
  height: fit-content;
  width: 100%;
  font-family: Tahoma, 'Arial Narrow', Arial, Helvetica, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  display: flex;
  flex-direction: row;
  color: black;
  background-color: white;
}

#action-container {
  min-width: max-content;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  margin: 0.4%;
  padding: 0.4%;
  border: solid black;
}

body {
  margin: 0.008%;
  padding: 0.008%;
}
</style>
