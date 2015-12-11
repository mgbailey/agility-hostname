/*----------------------------------------

 Host naming field integration policy
 
 Authors: 
	Mike Bailey, CSC
 
 Type: 
   LifecycleValidation
 
 Asset types:
   Instance
 
 Events:
   Provision
 
 Prerequisites:
   * Minion Agility platform script must be present.
	* sendEMAIL Agility platform script must be present.
	* In Admin->Setup, set AgilityManager.HostnameSuffixOptional = true
	* /home/smadmin allows .naming.lck and .naming.cnt files to be made.
	   Alternatvely, an NFS server to contain the .naming.lck and .naming.cnt files.
	   (You will need to change the below variables in this case.  This would be 
	   needed if you are doing a distributed Agility deployment, and so need to put
	   these files in a location accessible to all worker nodes.)

 Description:
	This policy generates a hostname according to the following specifications.
		Hostname: PrefixXXXX
		Prefix = Some text generated from properties and varibles accessible within Agility.
		         For this example, it is a hard-coded string.
		XXXX = 4-digit suffix.  
	A unique (not reused) suffix will be generated for the prefix.
	This name is placed into a template's hostnamePrefix,
   so that when the template is spun up, the resulting VM will get this name.
   The name is checked for uniqueness using ping.

----------------------------------------*/

importScript("Minion", 1); // Import Minion Library script
importScript("sendEMAIL");

$setLogPrefix("Host naming: "); // Prefix this to the logging
$enableDebugMode(true);
success = true;
errString = "";

var ADMIN_GROUP = "myAdmins@acme.com";                // Set to the admin address that gets email notifications
var namingLockFile = "/home/smadmin/.naming.lck";     // Location for the lock file.  Will be created automatically.
var namingCountersFile = "/home/smadmin/.naming.cnt"; // Location for the counters file.  Will be created automatically.

var counterMax = 10000;		// Limit of the counter that is the hostname suffix.  If we reach this, it is an error!
var counterMargin = 500;	// Start sending warnings when we are within this margin of the counterMax.

// Kick off the main code in a function (below)
main();


function getLockConfig (instance) {  // Instance is an Agility instance object (not minion2).
	var lockConfig = {};
	
	lockConfig["uuid"] = String(instance.getUuid());
	lockConfig["pathname"] = namingLockFile;
	if (lockConfig.pathname === null) {
		$error("Failed to determine pathname to lock file");
		return null;
	}
	return lockConfig;	
}


// Create lock file to use as a mutex for infoblox access
function getLock(lockConfig) {
   var locked = false;
   var maxAttempts = 200;
   var attempts = 0;

	$info("Getting lock for " + lockConfig.uuid);
   
   while (locked == false) {
		if ($fileExists(lockConfig.pathname) == false) {
   		$writeFile(lockConfig.pathname, lockConfig.uuid);
			// pause 3 seconds and verify
         java.lang.Thread.sleep(3000);
         lockedUuid = $readFile(lockConfig.pathname);
         if (lockConfig.uuid == lockedUuid) {
         	$info("Got lock for UUID=" + lockConfig.uuid);
         	locked = true;
        	}
         else {
            waitToRetry = Math.floor(Math.random() * 4000) + 5000;
            $debug("Tried to get lock, but " + lockedUuid + " got it first.  Will wait " + waitToRetry + "ms.  " + (maxAttempts - attempts) + " retries remaining."); 
            java.lang.Thread.sleep(waitToRetry);
         }
      }
      else {
         waitToRetry = Math.floor(Math.random() * 4000) + 5000;
         $debug("Lock is in use.  Will wait " + waitToRetry + "ms.  " + (maxAttempts - attempts) + " retries remaining."); 
         java.lang.Thread.sleep(waitToRetry);        
      }
      if (attempts++ >= maxAttempts) {
         $error("Unable to obtain a lock after " + maxAttempts + " retries");
         throw "Unable to obtain a file lock for a thread.  The maximum number of attempts was exceeded.";
      }
   }
}


function unLock(lockConfig) {

  $info("Releasing lock for " + lockConfig.uuid);

   if ($fileExists(lockConfig.pathname)) {
      lockedUuid = $readFile(lockConfig.pathname);
		if (lockedUuid == lockConfig.uuid) {
      	$info("Removing lock file.");
      	$deleteFile(lockConfig.pathname);
      }
      else {
      	$warn("Expected to find lock file for " + lockConfig.uuid + ", but found one for " + lockedUuid + " instead.");
      }
   }
   else {
   	$warn("Expected to find lock file for unlocking, but it was not present.");
   }
}

//
// Utility functions to send email notifications
//
function buildMessage(theInstance, subject, content) {
	var hostname = theInstance.getHostname();
   // define constants

   var NOW = new Date();

   $info("Making email for " + hostname);
   var template = agility.api.get(theInstance.getTemplate());
	var topTopo = $getOuterMostTopology(template);
   $info("Parent topology: " + topTopo.name );
   var creator = agility.api.get(topTopo.getCreator());
   $info("Creator : " + creator.name );

   var user = creator.name;

   // Build email

   var body = "** This is a message automatically generated from the Agility Platform.  Do not reply. **\n\n";
	body += content + "\n\n";
   body += "VM Instance details:\n";
   body += "Timestamp: " + NOW + "\n";
   body += "VM Name: " + theInstance.name + "\n";
	body += "Hostname: " + hostname + "\n";
	body += "Agility Hierarchical Location: " + theInstance.assetPath + "\n";
   body += "User:" + user + "\n";
   body += "\n";
	
	return {subject:subject, body:body};
}

  
function sendNotification(notification) {

	var TO_ADDRESS = ADMIN_GROUP;

   // Write some debugging to the Agility log
   $info("*** Sending Email ***");
   $info("------------------------------------------");
   $info("to: " + TO_ADDRESS);
   $info("Subject: " + notification.subject);
   $info("Body: " + notification.body);
   $info("------------------------------------------"); 

   sendEmail(TO_ADDRESS, notification.subject, notification.body);  
} 


function fetchAndIncrement(preprefix, instance) {
	var JSONStr = "";
	var counters = {};
	var counter;
	
	/* Counter requirements can vary by customer.  In this case, a counter is set for each unique 
	 * prefix.  Counters begin at 0 end at counterMax - 1.  When a counter approaches 
	 * the end of the range, it begins sending notifications to the admin email address.
	 */
	 
	try {
		try {
			var lockConfig = getLockConfig(instance);
			getLock(lockConfig);
			if ($fileExists(namingCountersFile) == true) {
				JSONStr = $readFile(namingCountersFile);
				$debug("Counter file contents: " + JSONStr);
				counters = JSON.parse(JSONStr);
				if (preprefix in counters) {
					$debug("Found " + preprefix);
					counter = counters[preprefix];
				}
				else{
					counter = 0;
				}	
			}
			else {
				counter = 0;
			}
			counters[preprefix] = counter + 1;
			JSONStr = JSON.stringify(counters);
   		$writeFile(namingCountersFile, JSONStr);
		}
		catch(err) {
			errString += "Error while getting the counter, line " + err.lineNumber() + ".  Error Message: " + err.getMessage() + "\n";
			counter = null;
		}
		finally {
			unLock(lockConfig);
		}		
	}
	catch(err) {
		success = false;
		errString += "While getting sequence count: " + err.message + ", line " + err.lineNumber + "\n";
	}
	if (counter >= counterMax) {
		var notificationMsg = "The sequence counter has reached its limit, and no more hostnames can be generated for a name that begins with " + preprefix;
		$error(notificationMsg);
		var notification = buildMessage(instance, "ERROR: unable to generate hostname for VM", notificationMsg);
		sendNotification(notification);
		counter = null;
	}
	else if (counter >= (counterMax - counterMargin)) {
		var notificationMsg = "Name counter for prefix " + preprefix + " is nearing its limit.  Only " + (counterMax - counter) + " hostnames remain in the sequence.";
		$warn(notificationMsg);
		var notification = buildMessage(instance, "ACTION REQUIRED: hostname counter is approaching its limit.", notificationMsg);
		sendNotification(notification);		
	}
	return counter;
}


function testName(FQDN) {
  
   // try a ping
	nameToPing = FQDN;
	$debug("Name to ping: " + nameToPing);
   ret = $runCommand("/bin/ping -q -w 1 " + nameToPing);
	$debug("ping returns: ")
   if (ret.code == "0" || ret.code == "1") {
      $info("A server with name " + nameToPing + " answered a ping.  Look for another name.");
      return false;
   }
   return true;
}


function buildHostnamePrefix(instance) {
   /* Typically this will be customer-specific.  It usually requires getting property
    * values from various Agility assets, the type of server being provisioned (windows
    * or linux), etc. and combining codes derived from these into a hostname.
    * For this example, a hardcoded string will do.
    */
    return "testPrefix";
}


function main() {
	$info("================== Start Naming Policy ===================");

	try {
		var instance = $getCurrentAsset();
		var template = agility.api.get(instance.getTemplate());
		$setLogPrefix("Host naming (" + template.name + "): ")
		
      prefix = buildHostnamePrefix(instance);
      
      $debug("hostname pre-prefix: " + prefix);

      // Build hostname & test for uniqueness
      var accepted = false;
      var loopCounter = 0;
      var namestr = "";
      while ((success) && (accepted == false)) {
         var sequenceCount = fetchAndIncrement(prefix, instance);
         if (sequenceCount === null) {
            success = false;
            errString += "Unable to retrieve sequence counters.\n"
         }
         else {
            $debug("Trial Sequence-Count: " + sequenceCount);
            sequenceStr = ("000" + sequenceCount).slice(-4);      // this is for a 4-digit counter.
            namestr = prefix + sequenceStr;
            try {
               accepted = testName(namestr);       // Depending on DNS configuration, a domain may need to be appended here.
            }
            catch(err) {
               success = false;
               errString += "While testing name uniqueness: " + err.message + ", line " + err.lineNumber + "\n";
            }
            loopCounter += 1;
            if (loopCounter >= 1000) {
               success = false;
               errString += "For prefix " + prefix + ", 1000 names tested without finding a unique name.\n";
            }
         }
      }

      // Set name on template
      if (success) {
        $info("Setting hostname to: " + namestr);
         try {
            template.setHostnamePrefix(namestr);
            agility.api.update(template);
         }
         catch(err) {
            success = false;
            errString += "While setting hostnamPrefix: " + err.message + ", line " + err.lineNumber + "\n";
         }
      }

	}
	catch(err) {
		success = false;
		errString += "An error was reported from line " + err.lineNumber + ".  Error Message: " + err.message + "\n";
	}

	if (success) {
		$info("New hostname:" + template.hostnamePrefix);
	}
	else {
		$error("Error in hostnaming: " + errString);
		var notification = buildMessage(instance, "An error occurred while building a hostname for a new VM", "Error message: " + errString);
		sendNotification(notification);
	}

	$debug("Returning " + success + " from main()");
	return success;
}

success;
