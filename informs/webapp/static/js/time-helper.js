var d = new Date();

let timeTable = {
    "1-day-ago" : d.setDate(d.getDate()-1),
    "today" : Date.now(),
    "1-month-ago" : d.setDate(d.getDate()-30),
    "now": Date.now(),
    "1-week-ago" : d.setDate(d.getDate()+24)
}

const setDateTimeLocal = (formatted, nodeName) => {
    nodeName.includes('start') ? document.getElementById('id_start').value = formatted : document.getElementById('id_end').value = formatted;
}

const formatEpoch = (ts, nodeName, timeAgo = '') => {

    let formattedStr = ''

    if(timeAgo === 'yesterday') {
        ts = timeTable['today']
    }

    someDate = new Date(ts);

    if(timeAgo === 'now' || timeAgo === 'start' || timeAgo === 'end') {
        nodeName = timeAgo
        formattedStr = someDate.getFullYear()+"-"+ ( "0" + (someDate.getMonth() + 1)).slice(-2) +"-"+('0'+someDate.getDate()).slice(-2)+"T"+('0' + someDate.getHours()).slice(-2)+":"+('0' + someDate.getMinutes()).slice(-2);
    } else {
        formattedStr = someDate.getFullYear()+"-"+ ( "0" + (someDate.getMonth() + 1)).slice(-2) +"-"+('0'+someDate.getDate()).slice(-2)+"T"+"00:00"
    }

    setDateTimeLocal(formattedStr, nodeName);
}

const calculateTime = e => {
    timeTable['now'] = timeTable['today'] = Date.now()
    const nodeName = e.parentNode.id;
    const timeAgo = e.name;
    formatEpoch(timeTable[timeAgo], nodeName, timeAgo)
}

const lastHours = e => {
    n = Date.now();
    d = new Date(n);
    e.name.includes('3') ? hoursAgoTs = d.setHours(d.getHours()-3) : hoursAgoTs = d.setHours(d.getHours()-1);

    formatEpoch(hoursAgoTs, e.name, 'start')
    formatEpoch(n, e.name, 'end');
}

// show/hide popup tooltip on /gpsdevices
function showTooltip(e) {
    console.log(e.id)
    var popup = document.getElementById("myPopup"+e.id);
    popup.classList.remove("hide")
    popup.classList.add("show");
  }

  function hideTooltip(e) {
    var popup = document.getElementById("myPopup"+e.id);
    popup.classList.remove("show")
    popup.classList.add("hidden");
  }
