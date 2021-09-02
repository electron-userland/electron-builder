"use strict"

loadNavPane()

function loadNavPane() {
  const isMobile = window.matchMedia("only screen and (max-width: 760px)").matches
  if (isMobile) {
    return
  }

  let nav = document.getElementsByClassName("md-nav")
  for (let i = 0; i < nav.length; i++) {
    const item = nav.item(i)
    if (typeof item.style === "undefined") {
      continue;
    }

    if (item.getAttribute("data-md-level") && item.getAttribute("data-md-component")) {
      item.style.display = 'block'
      item.style.overflow = 'visible'
    }
  }

  nav = document.getElementsByClassName("md-nav__toggle")
  for (let i = 0; i < nav.length; i++) {
    nav.item(i).checked = true;
  }
}