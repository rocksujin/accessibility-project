import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Analyze } from './pages/Analyze'
import { Keyboard } from './pages/Keyboard'
import { Component } from './pages/Component'
import { NotFound } from './pages/NotFound'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="analyze" element={<Analyze />} />
        <Route path="keyboard" element={<Keyboard />} />
        <Route path="component" element={<Component />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export default App
