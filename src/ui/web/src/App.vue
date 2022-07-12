<template>
  <!-- <nav>
    <router-link to="/">Home</router-link> |
    <router-link to="/about">About</router-link>
  </nav> -->
  <!-- <div style="height:100%;width:100%;padding:10px"> -->
    <router-view />
  <!-- </div> -->
</template>

<style>
#app {
  height: 100%;
  width: 100%;
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  padding: 0;
  height: 100vh;
  width: 100vw;
  background-color: rgb(233, 227, 227);
}

.def-btn {
  background-color: rgb(25, 118, 210);
  color: white;
  padding: 6px 14px;
  font-size: 35px;
  font-weight: bold;
  border-radius: 5px;
}

.def-btn:hover {
  background-color: rgb(10, 113, 195);
}

.def-btn:active {
  background-color: rgb(255, 113, 195);
}
</style>
