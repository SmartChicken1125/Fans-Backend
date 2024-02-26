import * as React from "react";
import FypBaseTemplate from "../components/FypBaseTemplate.js";

interface VideoCallStartingForCreatorTemplateProps {
	creatorName: string;
	fanName: string;
	joinLink: string; // URL for the creator to join the call
}

export function VideoCallStartingForCreatorTemplate(
	props: VideoCallStartingForCreatorTemplateProps,
) {
	return (
		<FypBaseTemplate>
			<h1>Your Video Call with {props.fanName} is Starting!</h1>

			<div>Hi {props.creatorName},</div>
			<div style={{ marginTop: "20px" }}>
				Your scheduled video call with {props.fanName} is beginning now.
				Click here to join and connect with your fan:{" "}
				<a href={props.joinLink}>Join Call</a>. Enjoy your call!
			</div>
			<div style={{ marginTop: "30px" }}>
				Regards,
				<br />
				The FYP.Fans Team
			</div>
		</FypBaseTemplate>
	);
}
