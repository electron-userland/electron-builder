import React, { useEffect, useRef } from "react"
import styles from "./index.module.css"

export default function SearchBar() {
  const containerRef = useRef(null)

  useEffect(() => {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = "/pagefind/pagefind-ui.css"
    document.head.appendChild(link)

    const script = document.createElement("script")
    script.src = "/pagefind/pagefind-ui.js"
    script.onload = () => {
      if (containerRef.current && window.PagefindUI) {
        new window.PagefindUI({
          element: containerRef.current,
          showSubResults: true,
        })
      }
    }
    document.head.appendChild(script)

    return () => {
      document.head.removeChild(link)
      if (document.head.contains(script)) document.head.removeChild(script)
    }
  }, [])

  return <div ref={containerRef} className={styles.container} />
}
