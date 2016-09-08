const options = {
    duration: 3000,
    location: 'tc',
    message: "Here is notifications",
    title: 'You pressed the button!',
    fixed: false
};

document.getElementById('notifyButton').onclick = function(){
    const {ipcRenderer} = require(`electron`);
    ipcRenderer.send('notify', options);
};