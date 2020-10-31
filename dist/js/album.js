var lsKeys={},page={lazyLoad:null};window.addEventListener("DOMContentLoaded",(function(){for(var e=document.querySelectorAll(".file-size"),n=0;n<e.length;n++)e[n].innerHTML=page.getPrettyBytes(parseInt(e[n].innerHTML.replace(/\s*B$/i,"")));page.lazyLoad=new LazyLoad}));
//# sourceMappingURL=album.js.map
