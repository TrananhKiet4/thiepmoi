import type {Content} from "../../../packages/contracts/src/index.js";
export function demoContent(heroId:string|null):Content{return {
 schemaVersion:1,host:{fullName:'Người tốt nghiệp',university:'Trường đại học mẫu',major:'Ngành học mẫu',cohort:'DEMO'},
 ceremony:{startAt:'2099-12-01T02:00:00Z',endAt:'2099-12-01T05:00:00Z',venueName:'Hội trường mẫu',address:'Địa chỉ minh họa — vui lòng cập nhật',latitude:10.7769,longitude:106.7009,entranceNote:'Cổng vào mẫu'},
 meetup:{startAt:'2099-12-01T05:00:00Z',endAt:'2099-12-01T06:00:00Z',venueName:'Sân trường mẫu',address:'Điểm hẹn minh họa',latitude:10.7769,longitude:106.7009,entranceNote:''},
 rsvpDeadline:'2099-11-30T16:59:00Z',wishDeadline:null,timezone:'Asia/Ho_Chi_Minh',theme:{palette:'cream',font:'serif'},music:{enabled:false,assetId:null,volume:.25,loop:true},groupMessages:{},
 sections:[
  {id:'opening',type:'opening',enabled:true,order:0,data:{title:'Một lời mời dành riêng cho bạn',messageTemplate:'Thân mời {{guestName}} cùng {{hostName}} lưu giữ một ngày thật đẹp.',coverAssetId:null}},
  {id:'hero',type:'hero',enabled:true,order:1,data:{title:'Một hành trình mới bắt đầu',subtitle:'Lễ tốt nghiệp · Thông tin minh họa',heroAssetId:heroId}},
  {id:'story',type:'story',enabled:true,order:2,data:{items:[{id:'s1',label:'Ngày đầu tiên',title:'Bắt đầu bằng một ước mơ',body:'Nội dung mẫu. Hãy kể câu chuyện của bạn tại trang quản trị.',imageAssetId:null}]}},
  {id:'gallery',type:'gallery',enabled:true,order:3,data:{items:heroId?[{assetId:heroId,caption:'Ảnh minh họa được tạo riêng cho bản demo'}]:[]}},
  {id:'invitation',type:'invitation',enabled:true,order:4,data:{title:'Hẹn bạn trong ngày đặc biệt',message:'Sự hiện diện của bạn là món quà đáng quý nhất.'}},
  {id:'map',type:'map',enabled:true,order:5,data:{title:'Chúng mình gặp nhau ở đây',locationSource:'MEETUP',instructions:'Địa điểm minh họa, cập nhật trước khi gửi thiệp thật.'}},
  {id:'response',type:'response',enabled:true,order:6,data:{title:'Bạn sẽ đến chứ?',rsvpIntro:'Cho mình biết để đón tiếp bạn thật chu đáo.',wishIntro:'Một vài dòng gửi lại cho ngày đáng nhớ.'}},
  {id:'closing',type:'closing',enabled:true,order:7,data:{message:'Cảm ơn vì đã là một phần trong hành trình này.',attendingMessage:'Mong chờ được gặp bạn!',declinedMessage:'Cảm ơn lời nhắn, hẹn gặp bạn vào dịp khác.'}}
 ]};}
