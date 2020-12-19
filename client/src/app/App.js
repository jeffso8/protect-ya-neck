import React from "react";
import Game from '../component/Game';
import Home from '../component/Home';
import Room from '../component/Room';
import {BrowserRouter, Route} from 'react-router-dom';

function App() {

  return (
    <BrowserRouter>
      <Route exact path='/' component={Home} />
      <Route exact path='/:roomID' component={Room} />
      <Route path='/:roomID/game' component={Game} />
    </BrowserRouter>
  );
}

export default App;