function dceGetElementSettings($element){var elementSettings=[];var modelCID=$element.data("model-cid");if(elementorFrontend.isEditMode()&&modelCID){var settings=elementorFrontend.config.elements.data[modelCID];var type=settings.attributes.widgetType||settings.attributes.elType;var settingsKeys=elementorFrontend.config.elements.keys[type];if(!settingsKeys){settingsKeys=elementorFrontend.config.elements.keys[type]=[];jQuery.each(settings.controls,function(name,control){if(control.frontend_available){settingsKeys.push(name)}})}
jQuery.each(settings.getActiveControls(),function(controlKey){if(-1!==settingsKeys.indexOf(controlKey)){elementSettings[controlKey]=settings.attributes[controlKey]}})}else{elementSettings=$element.data("settings")||{}}
return elementSettings}
function dceIsSwiperLatest(){let experiments=elementorFrontend.config.experimentalFeatures;if(typeof experiments.e_swiper_latest==="undefined"){return!1}
return experiments.e_swiper_latest}
function dceObserveElement($target,$function_callback){if(!elementorFrontend.isEditMode()){return}
const config={attributes:!0,childList:!1,characterData:!0,};const MutationObserver=window.MutationObserver||window.WebKitMutationObserver||window.MozMutationObserver;const observer=new MutationObserver($function_callback);observer.observe($target,config)}
window.dynamicooo={};
/**
 * @copyright Elementor
 * @license GPLv3
 */
dynamicooo.getActiveBreakpointsMinPointAndPostfix=()=>{let breakpoints=elementorFrontend.config.responsive.activeBreakpoints;let ret={};for(let key in breakpoints){ret[key]={min_point:elementorFrontend.breakpoints.getDeviceMinBreakpoint(key),postfix:`_${key}`,}}
ret.desktop={min_point:elementorFrontend.breakpoints.getDeviceMinBreakpoint("desktop"),postfix:"",};return ret};dynamicooo.makeSwiperBreakpoints=(swiperSettings,elementorSettings,prefix="",)=>{const elementorBreakpoints=dynamicooo.getActiveBreakpointsMinPointAndPostfix();const breakpoints={};const lastBreakpointValues={};Object.keys(elementorBreakpoints).reverse().forEach((breakpointName)=>{let min_point=elementorBreakpoints[breakpointName].min_point;if(elementorBreakpoints[breakpointName].postfix==="_mobile"){min_point=0}
let breakpointSettings={};for(let swiperSettingsKey in swiperSettings){const setting=swiperSettings[swiperSettingsKey];const defaultValue=setting.default_value;const elementorKeyWithPostfix=prefix+setting.elementor_key+elementorBreakpoints[breakpointName].postfix;let value=elementorSettings[elementorKeyWithPostfix];if(swiperSettingsKey==="spaceBetween"&&typeof value==="object"){value=value.size||defaultValue}
value=value||dceGetParentValue(lastBreakpointValues[swiperSettingsKey],)||defaultValue;value=value==="auto"?value:Number(value);if(!lastBreakpointValues[swiperSettingsKey]){lastBreakpointValues[swiperSettingsKey]=[]}
lastBreakpointValues[swiperSettingsKey].push(value);if(swiperSettingsKey==="slidesPerGroup"&&breakpointSettings.slidesPerView===1){value=1}
breakpointSettings[swiperSettingsKey]=value}
breakpoints[min_point]=breakpointSettings});return breakpoints};function dceGetParentValue(lastBreakpointValue){const lastIndex=lastBreakpointValue?lastBreakpointValue.findLastIndex((el)=>el!==0):-1;if(lastIndex!==-1){return lastBreakpointValue[lastIndex]}
return!1}
window.initMap=()=>{const event=new Event("dce-google-maps-api-loaded");window.dispatchEvent(event)}