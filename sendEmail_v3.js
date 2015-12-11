// Eric Sonchaiwanich, Servicemesh
// Modified 05/15/2014 by Mike Bailey

// Requires that Minion be imported. Check to see if it is.
if (typeof($info) == "undefined") {
	importScript("Minion");
}


$debug("======================================");
$debug("Loading EMAIL module");
$debug("======================================");

var BASE_DIR          = "/opt/agility-platform/policy/scripts";
var SCRIPT_NAME       = BASE_DIR + "/emailClient.py";
var MAIL_SERVER = "";
var MAIL_PORT = "25";
var MAIL_SECURITY = "";
var MAIL_USERNAME = "";
var MAIL_PASSWORD = "";
var MAIL_FROM = "agility-platform@kpmg.com";

// This is a python script to send an email, contained in a long text string.  
// It can be written out to a file, as needed.
var CLIENT_SCRIPT = "\
#!/usr/bin/env python\n\
\n\
import smtplib\n\
import sys\n\
\n\
def showUsage():\n\
  print('Usage: %s <smtpServer> <smtpPort> <TLS|NONE> <user> <password> <from> <to> <subject> <message>' % sys.argv[0])\n\
# /def showUsage\n\
\n\
\n\
if (len(sys.argv) != 10):\n\
  showUsage()\n\
  sys.exit('Expected 10 arguments, got %s' % len(sys.argv))\n\
\n\
SERVER   = sys.argv[1]\n\
PORT     = sys.argv[2]\n\
PROTOCOL = sys.argv[3]\n\
LOGIN    = sys.argv[4]\n\
PASSWORD = sys.argv[5]\n\
FROMADDR = sys.argv[6]\n\
TOADDRS  = sys.argv[7]\n\
SUBJECT  = sys.argv[8]\n\
MSGTEXT  = sys.argv[9]\n\
\n\
msg = \"\"\"\\\n\
From: %s\n\
To: %s\n\
Subject: %s\n\
\n\
%s\n\
\"\"\" % (FROMADDR, TOADDRS, SUBJECT, MSGTEXT)\n\
\n\
server = smtplib.SMTP(SERVER, int(PORT))\n\
server.ehlo()\n\
if PROTOCOL == 'TLS':\n\
  server.starttls()\n\
  server.ehlo()\n\
  server.login(LOGIN, PASSWORD)\n\
server.sendmail(FROMADDR, TOADDRS.split(','), msg)\n\
server.quit()\n\
print('Email successfully sent to: ' + TOADDRS)\n\
";


// There is a bug in Minion 9.0.2 that this works around.
function createDir(path) {
	new java.io.File(path).mkdirs();
}


// Check to see if the directory structure and python script required for email is in place
// If not, make the directories and write out the script.  Set needed permissions.
function writeExecutableScript(pathname, script) {
	$debug("Checking Python email script on server.")
	
/*	if (pathname[0] != '/') {
    	throw $exception("You must use a full pathname for writeExecutableScript().");
	}
	if (pathname[0] != '/') {
    	throw $exception("writeExecutableScript() pathname should not end in '/'.");
	}
	var nameElems = pathname.split('/');

	var rebuilt = '';
	for (i = 1; i < nameElems.length - 1; i++) {
    	if (nameElems[i].length == 0) {
        	continue;
    	}
    	rebuilt += '/' + nameElems[i];
    	if (minion.IO.isDir(rebuilt) == false) {
    		$info("Adding directory '" + rebuilt + " on Agility platform.");
    		//$createDir(rebuilt);
    	}
	}
	rebuilt += "/" + nameElems[nameElems.length - 1];
	console.log("script path: " + rebuilt)	
*/	
	

    // validate pathname & grab directory part of it.
	var validPathname = pathname.match(/^(\/.*)\/[^\/]*/);	
	if (validPathname) {
		// make the directory, if needed
		$debug("validating directory");
		if (minion.io.isDir(validPathname[1]) == false) {
    		$info("Making directory '" + validPathname + " on Agility platform.");
    		createDir(validPathname);
		}
		
		$debug("validating Python file");
		if ($fileExists(pathname)) {
			$info("No client script setup is necessary");
		}
		else {
		   $debug("Writing Python file");
			$writeFile(pathname, script);
			var ret = minion.io.runCommand("chmod 755 " + pathname);
  			if (ret.code == 0) {
    			// success
    			$info("SUCCESS in SCRIPT SETUP -- code: " + ret.code + "\nstdout: " + ret.stdout + "\nstderr: " + ret.stderr);

  			} else {
    			// failure
    			$error("ERROR in SCRIPT SETUP -- code: " + ret.code + "\nstdout: " + ret.stdout + "\nstderr: " + ret.stderr);
  			}		
		}
	}
	else {
		$error("You must use a full pathname for writeExecutableScript().");
	}
}


function readEmailConfig() {

    $debug("Reading Agility configuration settings");
    
    MAIL_SERVER   = $getConfigValue("AgilityManager", "Mail.Server");
    MAIL_PORT     = $getConfigValue("AgilityManager", "Mail.Port");
    MAIL_SECURITY = $getConfigValue("AgilityManager", "Mail.Security");
    MAIL_USERNAME = $getConfigValue("AgilityManager", "Mail.Username");
    MAIL_PASSWORD = $getConfigValue("AgilityManager", "Mail.Password");

    $info("======== SCRIPT_NAME = " + SCRIPT_NAME + " ========");
    $info("======== MAIL_SERVER = " + MAIL_SERVER + " ========");
    $info("======== MAIL_PORT = " + MAIL_PORT + " ========");
    $info("======== MAIL_SECURITY = " + MAIL_SECURITY + " ========");
    $info("======== MAIL_USERNAME = " + MAIL_USERNAME + " ========");
}


function sendEmail(toAddress, subject, body) {

	readEmailConfig();
	writeExecutableScript(SCRIPT_NAME, CLIENT_SCRIPT);

	var commandArgs = [
	    SCRIPT_NAME, 
	    MAIL_SERVER, 
	    MAIL_PORT,
	    MAIL_SECURITY,
	    MAIL_USERNAME, 
	    MAIL_PASSWORD, 
	    MAIL_FROM, toAddress, subject, body];
   // Don't log the password!
	$debug("Running command: " + commandArgs.slice(0,1,2,3,4).join(" ") + " xxxx " + commandArgs.slice(6,7,8,9).join(" "));
	
	var ret = minion.io.runCommand(commandArgs);
  	if (ret.code == 0) {
    	// success
    	$info("EMAIL SUCCESS -- code: " + ret.code + "\n\tstdout: " + ret.stdout + "\n\tstderr: " + ret.stderr);

  	} else {
    	// failure
    	$error("ERROR sending email -- code: " + ret.code + "\n\tstdout: " + ret.stdout + "\n\tstderr: " + ret.stderr);
  	}		
	
}

