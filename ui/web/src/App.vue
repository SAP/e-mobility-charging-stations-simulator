<template>
  <router-view />
  <Container v-show="$route.path !== '/'" id="action-container">
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
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin: 0.1%;
  padding: 0.1%;
  border: solid black;
}

body {
  margin: 0.005%;
  padding: 0.005%;
}
</style>
