// 内容脚本 - 在页面上下文中运行，用于拦截网络请求

(function() {
    'use strict';
    
    console.log('Sheffield 提前签到助手内容脚本已加载 - 版本 2.3');
    console.log('当前页面URL:', window.location.href);
    
    // 添加更详细的日志函数
    function logInfo(message, data) {
        console.log(`[Sheffield Plugin] ${message}`, data || '');
    }

    // ------------------ 页面上下文hook与消息桥接 ------------------
    // 将页面上下文的消息转发给扩展（background）
    window.addEventListener('message', (event) => {
        // 只处理来自同一页面的消息
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || msg.source !== 'sheffield-ext') return;
        
        logInfo('收到页面消息:', msg);
        
        if (msg.type === 'SHEFFIELD_USER_INFO' || msg.type === 'SHEFFIELD_STATUS_INFO') {
            chrome.runtime.sendMessage({ type: msg.type, data: msg.data }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('转发页面数据到background失败:', chrome.runtime.lastError);
                } else {
                    logInfo(`已转发${msg.type}到background`);
                }
            });
        }
    }, false);

    // 使用chrome.scripting API注入脚本，避免CSP限制
    function injectPageHooksViaAPI() {
        logInfo('尝试通过chrome.scripting API注入脚本');
        
        chrome.runtime.sendMessage({
            type: 'INJECT_SCRIPT',
            tabId: 'current'
        }, (response) => {
            if (chrome.runtime.lastError) {
                logInfo('chrome.scripting API注入失败:', chrome.runtime.lastError.message);
                // 如果API注入失败，尝试其他方法
                tryAlternativeInjection();
            } else {
                logInfo('chrome.scripting API注入成功');
            }
        });
    }

    // 备用注入方法：使用外部脚本文件
    function tryAlternativeInjection() {
        logInfo('尝试备用注入方法');
        
        // 创建外部脚本元素
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('inject.js');
        script.onload = function() {
            logInfo('外部脚本加载成功');
            this.remove();
        };
        script.onerror = function() {
            logInfo('外部脚本加载失败，使用最后备用方案');
            // 最后的备用方案：监听网络事件
            setupNetworkMonitoring();
        };
        
        (document.head || document.documentElement).appendChild(script);
    }

    // 网络监听备用方案
    function setupNetworkMonitoring() {
        logInfo('启用网络监听备用方案');
        
        // 监听所有网络活动，并尝试通过其他方式获取数据
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.name.includes('/sso/state') || entry.name.includes('/campusm/sso/state')) {
                    logInfo('Performance API检测到SSO请求:', entry.name);
                    
                    // 尝试通过fetch重新请求获取数据
                    setTimeout(() => {
                        fetchSSoData(entry.name);
                    }, 100);
                }
            }
        });
        
        try {
            observer.observe({entryTypes: ['resource']});
            logInfo('Performance Observer已启动（备用方案）');
        } catch (e) {
            logInfo('Performance Observer启动失败:', e.message);
        }
    }

    // 重新请求SSO数据
    function fetchSSoData(url) {
        logInfo('尝试重新请求SSO数据:', url);
        
        // 清理URL参数，只保留基础路径
        const baseUrl = url.split('?')[0];
        
        fetch(baseUrl, {
            method: 'GET',
            credentials: 'include', // 包含cookies
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
        .then(response => {
            logInfo('重新请求响应状态:', response.status);
            return response.text();
        })
        .then(responseText => {
            logInfo('重新请求响应内容:', responseText);
            processSSoResponse(responseText, baseUrl);
        })
        .catch(error => {
            logInfo('重新请求失败:', error.message);
        });
    }

    // 处理SSO响应数据
    function processSSoResponse(responseText, url) {
        try {
            const data = JSON.parse(responseText);
            logInfo('解析的SSO数据:', data);
            
            // 提取用户信息
            const userInfo = {
                personID: data.personID || data.personId || (data.authUserInfo && data.authUserInfo.personId) || data.person_id,
                firstname: data.firstname || data.firstName || data.first_name,
                surname: data.surname || data.lastName || data.last_name,
                email: data.email || data.emailAddress || data.email_address,
                serviceUsername: data.serviceUsername_5076 || data.serviceUsername || data.username || data.user_name
            };
            
            const hasUserInfo = Object.values(userInfo).some(v => v !== undefined && v !== null && v !== '');
            
            if (hasUserInfo) {
                logInfo('发现用户信息，发送到background:', userInfo);
                chrome.runtime.sendMessage({
                    type: 'BRISTOL_USER_INFO',
                    data: userInfo
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('发送用户信息失败:', chrome.runtime.lastError);
                    } else {
                        logInfo('用户信息已发送');
                    }
                });
            } else if (data.orgCode) {
                logInfo('发现状态信息，发送到background:', data.orgCode);
                const statusInfo = {
                    orgCode: data.orgCode,
                    status: 'authenticated',
                    timestamp: new Date().toISOString(),
                    message: '已检测到Bristol University认证状态'
                };
                
                chrome.runtime.sendMessage({
                    type: 'BRISTOL_STATUS_INFO',
                    data: statusInfo
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('发送状态信息失败:', chrome.runtime.lastError);
                    } else {
                        logInfo('状态信息已发送');
                    }
                });
            }
        } catch (e) {
            logInfo('解析SSO响应失败:', e.message);
        }
    }

    // 启动注入流程
    function startInjection() {
        if (window.location.hostname.includes('sheffield.ac.uk')) {
            logInfo('检测到Sheffield大学网站，开始初始化');
            logInfo('页面标题:', document.title);
            
            // 优先使用chrome.scripting API
            injectPageHooksViaAPI();
            
            // 同时启动网络监听作为备用
            setTimeout(() => {
                setupNetworkMonitoring();
            }, 1000);
        }
    }

    // 在页面加载完成后启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startInjection);
    } else {
        startInjection();
    }

    // 立即启动网络监听
    setupNetworkMonitoring();

})();