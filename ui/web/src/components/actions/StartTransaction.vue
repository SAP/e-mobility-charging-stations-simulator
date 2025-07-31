<template>
  <h1
    id="action"
    class="text-largest mb-default"
  >
    Start Transaction
  </h1>

  <div class="station-info">
    <h2>{{ chargingStationId }}</h2>
    <h3>Connector {{ connectorId }}</h3>
  </div>

  <div class="form-group">
    <label for="idtag">RFID tag:</label>
    <input
      id="idtag"
      v-model.trim="state.idTag"
      name="idtag"
      placeholder="Enter RFID tag"
      type="text"
    >
  </div>

  <div class="checkbox-group">
    <label for="authorize-idtag">Authorize RFID tag:</label>
    <input
      id="authorize-idtag"
      v-model="state.authorizeIdTag"
      false-value="false"
      true-value="true"
      type="checkbox"
    >
  </div>

  <div class="button-container">
    <Button
      id="action-button"
      appearance="brand"
      @click="
        () => {
          state.authorizeIdTag = convertToBoolean(state.authorizeIdTag)
          if (state.authorizeIdTag) {
            if (state.idTag == null || state.idTag.trim().length === 0) {
              $toast.error('Please provide an RFID tag to authorize')
              return
            }
            $uiClient
              ?.authorize(hashId, state.idTag)
              .then(() => {
                $uiClient
                  ?.startTransaction(hashId, convertToInt(connectorId), state.idTag)
                  .then(() => {
                    $toast.success('Transaction successfully started')
                  })
                  .catch((error: Error) => {
                    $toast.error('Error at starting transaction')
                    console.error('Error at starting transaction:', error)
                  })
                  .finally(() => {
                    $router.push({ name: 'charging-stations' })
                  })
              })
              .catch((error: Error) => {
                $toast.error('Error at authorizing RFID tag')
                console.error('Error at authorizing RFID tag:', error)
                $router.push({ name: 'charging-stations' })
              })
          } else {
            $uiClient
              ?.startTransaction(hashId, convertToInt(connectorId), state.idTag)
              .then(() => {
                $toast.success('Transaction successfully started')
              })
              .catch((error: Error) => {
                $toast.error('Error at starting transaction')
                console.error('Error at starting transaction:', error)
              })
              .finally(() => {
                $router.push({ name: 'charging-stations' })
              })
          }
        }
      "
    >
      Start Transaction
    </Button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import Button from '@/components/buttons/Button.vue'
import { convertToBoolean, convertToInt } from '@/composables'

defineProps<{
  chargingStationId: string
  connectorId: string
  hashId: string
}>()

const state = ref<{ authorizeIdTag: boolean; idTag: string }>({
  authorizeIdTag: false,
  idTag: '',
})
</script>

<style>
/* Base styles for all form elements */
select, input[type="number"], input[type="text"], input[type="checkbox"] {
  padding: 8px;
  margin: 4px 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  transition: all 0.3s ease;
  font-size: 14px;
}

/* Form layout and section styles */
.form-group, .checkbox-group {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
}

/* Station info display */
.station-info {
  margin-bottom: 20px;
}

/* Labels */
label {
  font-weight: 500;
  margin-bottom: 6px;
  color: #555;
}

/* Hover and focus states */
input[type="text"]:hover {
  border-color: #888;
  background-color: #f5f5f5;
}

input[type="text"]:focus {
  border-color: #f48121;
  outline: none;
  box-shadow: 0 0 5px rgba(74, 144, 226, 0.3);
  background-color: #fff;
}

/* Text input specific styles */
#idtag {
  width: 100%;
  max-width: 300px;
  text-align: left;
}

/* Checkbox styles */
.checkbox-group {
  flex-direction: row;
  align-items: center;
}

.checkbox-group label {
  margin-bottom: 0;
  margin-right: 12px;
}

input[type="checkbox"] {
  cursor: pointer;
  width: 18px;
  height: 18px;
  position: relative;
  top: 2px;
  accent-color: #4a90e2;
}

/* Button container and styling */
.button-container {
  margin-top: 24px;
  text-align: center;
}

#action-button {
  margin-top: 16px;
  min-width: 200px;
}
</style>
