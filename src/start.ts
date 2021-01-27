import Bootstrap from './charging-station/Bootstrap';

Bootstrap.getInstance().start().catch(
  (error) => {
    console.error(error);
  }
);
