<template>
  <router-view />
  <Container id="action">
    <router-view name="action" />
  </Container>
</template>

<script setup lang="ts">
import Container from '@/components/Container.vue'
</script>

<style>
#app {
  height: fit-content;
  width: fit-content;
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  display: flex;
  flex-direction: row;
  color: black;
  background-color: white;
}

#action {
  min-width: max-content;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 0.1%;
  padding: 0.1%;
  border: solid black;
}

body {
  margin: 0.005%;
  padding: 0.005%;
}
</style>
