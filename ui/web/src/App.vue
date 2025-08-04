<template>
  <div class="app-container">
    <div class="main-content">
      <router-view />
    </div>

    <!-- Overlay for sidebar background -->
    <Transition name="fade">
      <div
        v-if="$route.name !== 'charging-stations' && $route.name !== 'not-found'"
        class="overlay"
        @click="$router.back()"
      />
    </Transition>

    <!-- Slide-out sidebar -->
    <Transition name="slide">
      <Container
        v-if="$route.name !== 'charging-stations' && $route.name !== 'not-found'"
        id="action-container"
      >
        <button
          class="close-button"
          title="Close panel"
          aria-label="Close panel"
          @click="$router.back()"
        >
          <XIcon :size="24" />
        </button>
        <div class="action-content">
          <router-view name="action" />
        </div>
      </Container>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { X as XIcon } from 'lucide-vue-next'
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

import Container from '@/components/Container.vue'

import './tailwind.css'

// Setup keyboard events for Escape key to dismiss sidebar
const router = useRouter()

const handleKeyDown = (event: Event) => {
  if ((event as { key?: string }).key === 'Escape') {
    // Check if we're on a route that shows the sidebar
    const currentRoute = router.currentRoute.value
    if (currentRoute.name !== 'charging-stations' && currentRoute.name !== 'not-found') {
      router.back()
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
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
  min-width: 350px;
  max-width: 450px;
  height: 100vh;
  display: flex;
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  text-align: left;
  padding: 1rem;
  padding-top: 3rem; /* Extra space at the top for the close button */
  border-left: solid 1px #e2e8f0;
  background-color: white;
  box-shadow: -5px 0 15px rgba(0, 0, 0, 0.1);
  overflow-y: auto;
  z-index: 100;
}

.app-container {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow-x: hidden;
}

.main-content {
  width: 100%;
  height: 100%;
}

.action-content {
  width: 100%;
  height: 100%;
  overflow-y: auto;
}

body {
  margin: 0;
  padding: 0;
  overflow-x: hidden;
}

/* Overlay styling */
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 50;
}

/* Close button styling */
.close-button {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 8px;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 101;
  border: none;
  outline: none;
  color: inherit;
  width: auto;
  min-width: unset;
  min-height: unset;
}

.close-button:hover {
  background: rgba(0, 0, 0, 0.1);
}

.close-button:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}

/* Slide transition for the sidebar */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%); /* Start/end position off-screen to the right */
}

.slide-enter-to,
.slide-leave-from {
  transform: translateX(0); /* Visible position */
}

/* Fade transition for the overlay */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-to,
.fade-leave-from {
  opacity: 1;
}
</style>
