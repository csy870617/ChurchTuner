// 0. 인앱 브라우저 탈출
(function() {
    const userAgent = navigator.userAgent.toLowerCase();
    const targetUrl = location.href;
    if (userAgent.match(/kakaotalk|line|instagram|facebook/i)) {
        if (userAgent.match(/android/i)) {
            location.href = 'intent://' + targetUrl.replace(/https?:\/\//i, '') + '#Intent;scheme=https;package=com.android.chrome;end';
        } else if (userAgent.match(/iphone|ipad|ipod/i)) {
            console.log('아이폰 인앱 브라우저 감지');
        }
    }
})();

// 유튜브 API 변수
let player;
let isPlayerReady = false;
let pendingPlay = null;

function onYouTubeIframeAPIReady() {
    // [핵심] 로그인 정보 연동을 위해 도메인을 명확히 지정
    const originUrl = window.location.origin;
    
    player = new YT.Player('youtube-player', {
        height: '100%',
        width: '100%',
        host: 'https://www.youtube.com', // 표준 호스트 강제
        playerVars: {
            'playsinline': 1,
            'rel': 0,
            'modestbranding': 1,
            'controls': 1,
            'origin': originUrl, // 출처 명시 (필수)
            'widget_referrer': originUrl, // 리퍼러 명시 (보안 강화)
            'enablejsapi': 1,
            'autoplay': 0,
            'disablekb': 1
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    isPlayerReady = true;
    
    // iframe에 쿠키 접근 권한 속성 추가 시도
    const iframe = document.getElementById('youtube-player');
    if (iframe) {
        // storage-access 권한 명시
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    }

    if (pendingPlay) {
        playRandomVideo(pendingPlay.category, pendingPlay.title);
        pendingPlay = null; 
    }
}

function onPlayerStateChange(event) {
    const playPauseBtn = document.getElementById('mini-play-pause');
    if (playPauseBtn) {
        if (event.data == YT.PlayerState.PLAYING) {
            playPauseBtn.innerText = "⏸";
        } else {
            playPauseBtn.innerText = "▶";
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then(reg => {
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        window.location.reload();
                    }
                });
            });
        });
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
        });
    }

    try { if (!Kakao.isInitialized()) Kakao.init('b5c055c0651a6fce6f463abd18a9bdc7'); } catch (e) {}

    // 앱 내 브라우저 로직
    const internalBrowser = document.getElementById('internal-browser');
    const browserContentArea = document.getElementById('browser-content-area');
    const browserCloseBtn = document.getElementById('browser-close-btn');

    function openInternalBrowser(url) {
        if (!internalBrowser || !browserContentArea) {
            window.open(url, '_blank');
            return;
        }

        browserContentArea.innerHTML = '';

        const newIframe = document.createElement('iframe');
        newIframe.id = 'browser-frame';
        newIframe.src = url;
        newIframe.frameBorder = '0';
        newIframe.style.width = '100%';
        newIframe.style.height = '100%';
        newIframe.style.background = '#fff';

        browserContentArea.appendChild(newIframe);
        internalBrowser.classList.add('show');
        
        history.pushState({ browserOpen: true }, null, "");
    }

    function closeInternalBrowser() {
        if (internalBrowser && internalBrowser.classList.contains('show')) {
            internalBrowser.classList.remove('show');
            setTimeout(() => { 
                if(browserContentArea) browserContentArea.innerHTML = ''; 
            }, 300);
            
            if (history.state && history.state.browserOpen) {
                history.back();
            }
        }
    }

    if (browserCloseBtn) {
        browserCloseBtn.onclick = () => {
            if (internalBrowser.classList.contains('show')) {
                 internalBrowser.classList.remove('show');
                 setTimeout(() => { if(browserContentArea) browserContentArea.innerHTML = ''; }, 300);
                 if (history.state && history.state.browserOpen) {
                     history.back();
                 }
            }
        };
    }

    // 순서 변경
    const listContainer = document.getElementById('main-list');
    let isDragging = false; 

    const savedOrder = JSON.parse(localStorage.getItem('menuOrder'));
    if (savedOrder) {
        const currentCards = Array.from(listContainer.children);
        const cardMap = {};
        currentCards.forEach(card => cardMap[card.id] = card);
        savedOrder.forEach(id => {
            if (cardMap[id]) listContainer.appendChild(cardMap[id]);
        });
    }

    new Sortable(listContainer, {
        animation: 150,
        delay: 200, 
        delayOnTouchOnly: true, 
        touchStartThreshold: 5, 
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        onStart: function() { isDragging = true; },
        onEnd: function (evt) {
            setTimeout(() => { isDragging = false; }, 100);
            const order = [];
            const cards = listContainer.querySelectorAll('.list-card');
            cards.forEach(card => order.push(card.id));
            localStorage.setItem('menuOrder', JSON.stringify(order));
        }
    });

    const viewListBtn = document.getElementById('view-list');
    const viewGridBtn = document.getElementById('view-grid');
    const shareTitle = document.querySelector('#card-share .text-box h3');

    const setViewMode = (mode) => {
        if (mode === 'grid') {
            listContainer.classList.add('grid-view');
            viewGridBtn.classList.add('active');
            viewListBtn.classList.remove('active');
            if(shareTitle) shareTitle.innerText = '친구 초대';
        } else {
            listContainer.classList.remove('grid-view');
            viewListBtn.classList.add('active');
            viewGridBtn.classList.remove('active');
            if(shareTitle) shareTitle.innerText = '함께 성장할 친구 초대';
        }
        localStorage.setItem('viewMode', mode);
    };
    const savedViewMode = localStorage.getItem('viewMode') || 'list';
    setViewMode(savedViewMode);
    
    if (viewListBtn) viewListBtn.onclick = () => setViewMode('list');
    if (viewGridBtn) viewGridBtn.onclick = () => setViewMode('grid');


    // 모달 관리
    const modalOverlay = document.getElementById('modal-overlay');
    const draggablePlayer = document.getElementById('draggable-player'); 
    const bibleModal = document.getElementById('bible-modal');
    const closeBibleModalBtn = document.getElementById('close-bible-modal');
    const iosModal = document.getElementById('ios-modal');
    const settingsModal = document.getElementById('settings-modal');
    const ccmMenuView = document.getElementById('ccm-menu-view');
    const ccmPlayerView = document.getElementById('ccm-player-view');
    const backToMenuBtn = document.getElementById('back-to-menu-btn');
    const shufflePlayBtn = document.getElementById('shuffle-play-btn');
    const floatModeBtn = document.getElementById('float-mode-btn'); 
    const maximizeOverlay = document.getElementById('maximize-overlay'); 
    const miniPlayPauseBtn = document.getElementById('mini-play-pause');
    const miniCloseBtn = document.getElementById('mini-close');

    const playerTitle = document.getElementById('player-title');
    const ccmBtn = document.getElementById('ccm-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const closeModalBtn = document.getElementById('close-modal');
    const closeIosModalBtn = document.getElementById('close-ios-modal');
    const closeSettingsBtn = document.getElementById('close-settings-modal');
    const moodBtns = document.querySelectorAll('.mood-btn');
    let currentModal = null; 
    let wakeLock = null;
    let currentCategory = null; 
    let lastVideoUrl = null; 

    // 드래그 로직
    let isPlayerDragging = false;
    let shiftX, shiftY;
    let dragStartTime = 0;
    let dragStartPos = { x: 0, y: 0 };

    const maximizePlayer = (e) => {
         if (e) {
             e.preventDefault();
             e.stopPropagation();
             e.stopImmediatePropagation(); 
         }

         modalOverlay.classList.remove('mini-mode');
         if(maximizeOverlay) maximizeOverlay.style.display = 'none';
         
         ccmMenuView.style.display = 'none';
         ccmPlayerView.style.display = 'block';

         draggablePlayer.style.top = '';
         draggablePlayer.style.left = '';
         draggablePlayer.style.bottom = '20px';
         draggablePlayer.style.right = '20px';
    };

    const startPlayerDrag = (e) => {
        if (!modalOverlay.classList.contains('mini-mode')) return;
        if (e.target.classList.contains('mini-btn')) return;

        isPlayerDragging = true;
        dragStartTime = new Date().getTime();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        dragStartPos = { x: clientX, y: clientY };
        const rect = draggablePlayer.getBoundingClientRect();
        shiftX = clientX - rect.left;
        shiftY = clientY - rect.top;
        draggablePlayer.style.transition = 'none';
        draggablePlayer.style.bottom = 'auto';
        draggablePlayer.style.right = 'auto';
        draggablePlayer.style.left = rect.left + 'px';
        draggablePlayer.style.top = rect.top + 'px';
    };

    const onPlayerDrag = (e) => {
        if (!isPlayerDragging) return;
        e.preventDefault(); 
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        draggablePlayer.style.left = (clientX - shiftX) + 'px';
        draggablePlayer.style.top = (clientY - shiftY) + 'px';
    };

    const endPlayerDrag = (e) => {
        if (!isPlayerDragging) return;
        isPlayerDragging = false;
        
        const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
        const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
        const distance = Math.sqrt(Math.pow(clientX - dragStartPos.x, 2) + Math.pow(clientY - dragStartPos.y, 2));

        if (distance < 10) {
             maximizePlayer(e);
        }
    };

    if (draggablePlayer) {
        draggablePlayer.addEventListener('mousedown', startPlayerDrag);
        draggablePlayer.addEventListener('touchstart', startPlayerDrag, {passive: false});
        document.addEventListener('mousemove', onPlayerDrag);
        document.addEventListener('touchmove', onPlayerDrag, {passive: false});
        document.addEventListener('mouseup', endPlayerDrag);
        document.addEventListener('touchend', endPlayerDrag);
    }

    if (maximizeOverlay) {
        maximizeOverlay.onclick = maximizePlayer;
    }

    if (miniPlayPauseBtn) {
        miniPlayPauseBtn.onclick = (e) => {
            e.stopPropagation(); 
            if (player && typeof player.getPlayerState === 'function') {
                const state = player.getPlayerState();
                if (state === YT.PlayerState.PLAYING) player.pauseVideo();
                else player.playVideo();
            }
        };
    }

    if (miniCloseBtn) {
        miniCloseBtn.onclick = (e) => {
            e.stopPropagation();
            closeModal(modalOverlay);
        };
    }

    const requestWakeLock = async () => { try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} };
    const releaseWakeLock = async () => { try { if (wakeLock) { await wakeLock.release(); wakeLock = null; } } catch (e) {} };

    const openModal = (modal) => {
        if (!modal) return;
        currentModal = modal;
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('show'));
        history.pushState({ modalOpen: true }, null, ""); 
    };

    const closeModal = (modal) => {
        if (!modal) return;
        
        modal.classList.remove('mini-mode');
        if (maximizeOverlay) maximizeOverlay.style.display = 'none';
        
        if(modal === modalOverlay && draggablePlayer) {
            draggablePlayer.style.top = '';
            draggablePlayer.style.left = '';
            draggablePlayer.style.bottom = '20px';
            draggablePlayer.style.right = '20px';
        }

        if (modal === modalOverlay) {
            if(player && typeof player.stopVideo === 'function') {
                player.stopVideo();
            }
            releaseWakeLock();
            setTimeout(() => { if(ccmPlayerView) ccmPlayerView.style.display = 'none'; if(ccmMenuView) ccmMenuView.style.display = 'block'; }, 300);
        }
        
        if (modal.id === 'internal-browser') {
            closeInternalBrowser();
            return;
        }

        modal.classList.remove('show');
        setTimeout(() => { modal.style.display = 'none'; if (currentModal === modal) currentModal = null; }, 300);
    };

    const handleCloseBtnClick = (modal) => { closeModal(modal); if (history.state && (history.state.modalOpen || history.state.browserOpen)) history.back(); };
    
    // 뒤로가기 로직
    window.addEventListener('popstate', () => {
        if (internalBrowser.classList.contains('show')) {
            internalBrowser.classList.remove('show');
            if(browserContentArea) browserContentArea.innerHTML = '';
            return;
        }
        
        if (currentModal) {
            if (currentModal === modalOverlay && modalOverlay.classList.contains('mini-mode')) {
                currentModal = null; 
                return;
            }
            closeModal(currentModal);
        }
    });

    if (ccmBtn) ccmBtn.onclick = () => openModal(modalOverlay);
    if (closeModalBtn) closeModalBtn.onclick = () => handleCloseBtnClick(modalOverlay);
    if (closeBibleModalBtn) closeBibleModalBtn.onclick = () => handleCloseBtnClick(bibleModal);
    if (bibleModal) bibleModal.onclick = (e) => { if (e.target === bibleModal) handleCloseBtnClick(bibleModal); };

    if (modalOverlay) modalOverlay.onclick = (e) => { 
        if (!modalOverlay.classList.contains('mini-mode') && e.target === modalOverlay) {
            handleCloseBtnClick(modalOverlay); 
        }
    };
    if (closeIosModalBtn) closeIosModalBtn.onclick = () => handleCloseBtnClick(iosModal);
    if (iosModal) iosModal.onclick = (e) => { if (e.target === iosModal) handleCloseBtnClick(iosModal); };
    if (settingsBtn) settingsBtn.onclick = () => openModal(settingsModal);
    if (closeSettingsBtn) closeSettingsBtn.onclick = () => handleCloseBtnClick(settingsModal);
    if (settingsModal) settingsModal.onclick = (e) => { if (e.target === settingsModal) handleCloseBtnClick(settingsModal); };

    function getYouTubeIdInfo(url) {
        if (!url) return null;
        const listMatch = url.match(/[?&]list=([^#&?]+)/);
        if (listMatch) return { type: 'playlist', id: listMatch[1] };
        const videoMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/)([^#&?]*))/);
        if (videoMatch) return { type: 'video', id: videoMatch[1] };
        return null;
    }

    window.playRandomVideo = (category, title) => {
        if (typeof CCM_PLAYLIST !== 'undefined' && CCM_PLAYLIST[category]) {
            const list = CCM_PLAYLIST[category];
            let availableList = list.filter(url => url !== lastVideoUrl);
            if (availableList.length === 0) availableList = list;
            const randomUrl = availableList[Math.floor(Math.random() * availableList.length)];
            lastVideoUrl = randomUrl;

            const idInfo = getYouTubeIdInfo(randomUrl);

            if(playerTitle && title) playerTitle.innerText = title;
            if(ccmMenuView) ccmMenuView.style.display = 'none';
            if(ccmPlayerView) ccmPlayerView.style.display = 'block';
            requestWakeLock();

            if (idInfo) {
                if (player && isPlayerReady) {
                    if (idInfo.type === 'playlist') {
                        player.loadPlaylist({list: idInfo.id, listType: 'playlist'});
                    } else {
                        player.loadVideoById(idInfo.id);
                    }
                } else {
                    console.log("Player not ready. Queuing...");
                    pendingPlay = { category: category, title: title }; 
                }
            }
        } else { alert("재생 목록이 없습니다."); }
    };

    moodBtns.forEach(btn => {
        btn.onclick = () => {
            const key = btn.getAttribute('data-key');
            const title = btn.querySelector('span:last-child').innerText;
            currentCategory = key;
            lastVideoUrl = null; 
            playRandomVideo(key, title);
        };
    });

    if (shufflePlayBtn) {
        shufflePlayBtn.onclick = () => {
            if (currentCategory) playRandomVideo(currentCategory, null);
        };
    }

    if (backToMenuBtn) {
        backToMenuBtn.onclick = () => {
            if(player && typeof player.stopVideo === 'function') player.stopVideo();
            if(ccmPlayerView) ccmPlayerView.style.display = 'none';
            if(ccmMenuView) ccmMenuView.style.display = 'block';
            releaseWakeLock();
        };
    }

    if (floatModeBtn) {
        floatModeBtn.onclick = () => {
            modalOverlay.classList.add('mini-mode');
            if (maximizeOverlay) maximizeOverlay.style.display = 'block';
        };
    }

    const hideModeBtn = document.getElementById('hide-mode-btn'); 
    let isHideMode = false;
    const applyHiddenStatus = () => {
        const hiddenList = JSON.parse(localStorage.getItem('hiddenCards')) || [];
        const cards = document.querySelectorAll('.list-card');
        cards.forEach(card => {
            if (hiddenList.includes(card.id)) card.classList.add('user-hidden'); 
            else card.classList.remove('user-hidden');
        });
    };
    applyHiddenStatus();
    if (hideModeBtn) {
        hideModeBtn.onclick = () => {
            isHideMode = !isHideMode;
            document.body.classList.toggle('hide-mode', isHideMode);
            if (isHideMode) { hideModeBtn.innerHTML = '✅'; hideModeBtn.classList.add('active'); } 
            else { hideModeBtn.innerHTML = '🙈'; hideModeBtn.classList.remove('active'); }
        };
    }

    if (listContainer) {
        listContainer.onclick = async (e) => {
            const card = e.target.closest('.list-card');
            if (!card) return;

            if (isDragging) return;

            if (isHideMode) {
                if (card.id === 'card-share' || card.id === 'card-market') {
                    alert("이 메뉴는 숨길 수 없습니다.");
                    return;
                }
                let hiddenList = JSON.parse(localStorage.getItem('hiddenCards')) || [];
                if (hiddenList.includes(card.id)) { hiddenList = hiddenList.filter(id => id !== card.id); card.classList.remove('user-hidden'); } 
                else { hiddenList.push(card.id); card.classList.add('user-hidden'); }
                localStorage.setItem('hiddenCards', JSON.stringify(hiddenList));
                return;
            }

            if (card.id === 'card-ccm') {
                openModal(modalOverlay);
            } else if (card.id === 'card-share') {
                const shareUrl = 'https://csy870617.github.io/faiths/';
                if (window.Kakao && Kakao.isInitialized()) {
                    try { Kakao.Share.sendScrap({ requestUrl: shareUrl }); return; } catch (err) {}
                }
                if (navigator.share) { try { await navigator.share({ url: shareUrl }); return; } catch (err) {} }
                try { await navigator.clipboard.writeText(shareUrl); alert('주소가 복사되었습니다!'); } catch (err) { prompt('주소:', shareUrl); }
            } else if (card.id === 'card-bible') {
                openModal(bibleModal);
            } else {
                const link = card.getAttribute('data-link');
                const title = card.querySelector('h3') ? card.querySelector('h3').innerText : 'FAITHS';
                const target = card.getAttribute('data-target');
                
                if (link) {
                    if (target === 'external') {
                        window.open(link, '_blank');
                    } else {
                        openInternalBrowser(link);
                    }
                }
            }
        };
    }

    const installBanner = document.getElementById('install-banner');
    const bannerInstallBtn = document.getElementById('banner-install-btn');
    const bannerCloseBtn = document.getElementById('banner-close-btn');
    const bannerNeverBtn = document.getElementById('banner-never-btn');
    let deferredPrompt;
    const showInstallBanner = () => {
        if (localStorage.getItem('installBannerHidden') === 'true') return;
        if (window.matchMedia('(display-mode: standalone)').matches) return;
        setTimeout(() => { if(installBanner) installBanner.classList.add('show'); }, 3000);
    };
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; showInstallBanner(); });
    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isIos) showInstallBanner();
    if (bannerInstallBtn) {
        bannerInstallBtn.onclick = () => {
            installBanner.classList.remove('show');
            if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.then((r) => { deferredPrompt = null; }); }
            else if (isIos) { setTimeout(() => openModal(iosModal), 300); }
            else { alert("브라우저 메뉴에서 [앱 설치]를 선택하세요."); }
        };
    }
    if (bannerCloseBtn) bannerCloseBtn.onclick = () => installBanner.classList.remove('show');
    if (bannerNeverBtn) bannerNeverBtn.onclick = () => { installBanner.classList.remove('show'); localStorage.setItem('installBannerHidden', 'true'); };

    const fontSizeSlider = document.getElementById('font-size-slider');
    if (fontSizeSlider) {
        const savedScale = localStorage.getItem('textScale');
        if (savedScale) { document.documentElement.style.setProperty('--text-scale', savedScale); fontSizeSlider.value = savedScale; }
        fontSizeSlider.oninput = (e) => { const scale = e.target.value; document.documentElement.style.setProperty('--text-scale', scale); localStorage.setItem('textScale', scale); };
    }
    const installAppBtn = document.getElementById('install-app-btn');
    if (installAppBtn) {
        installAppBtn.onclick = () => {
            if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.then((r) => { deferredPrompt = null; }); }
            else { const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent); if (isIos) { handleCloseBtnClick(settingsModal); setTimeout(() => openModal(iosModal), 350); } else { alert("이미 설치되어 있거나 브라우저 메뉴에서 설치 가능합니다."); } }
        };
    }
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const filterValue = tab.getAttribute('data-filter');
            const cards = document.querySelectorAll('.list-card');
            cards.forEach(card => {
                const cardCategory = card.getAttribute('data-category');
                if (filterValue === 'all' || filterValue === cardCategory) card.style.display = 'flex';
                else card.style.display = 'none';
            });
        };
    });
});