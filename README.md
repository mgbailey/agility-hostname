# agility-hostname
A generic script that can be adapted to assign custom hostnames for a customer.  

## Features
* Individual counters for each hostname prefix used
* Counters do not wrap
  * Privides unique hostnames
* Warning emails sent when counters approach the end of the range
* Error emails sent when counters are out-of-range (host naming fails)
* File lock used as a mutex semaphore
  * Naming performs reliably in a distributed Agility deployment

## Description
Your customers will have their own naming conventions that you need to conform to.  Usually, this will consist of an alphanumeric prefix, a numeric counter, and possibly an alphanumeric suffix.  The prefix and possibly the suffix will often not be static, but will be dependent on user inputs, the location of the server, the operating system, and other factors.  You will need to do some scripting to pull this information from whereever it is located, encode it according to customer standards, and generate the corresponding parts of the hostname.
To assist, this sample script takes care of the counter portion of the problem for you.  For the prefix portion, there is a function called buildHostnamePrefix for you to fill in.  Currently, it just returns a static string.  This example script doesn't provide for a suffix, but one could be easily generated and appended using similar techniques.  This script starts with counters at 0, but this could also be easily modified to start at some other value.

## How to use
1. Replace "myAdmins@acme.com" with the correct email address for the user(s) to be notified if the counter is about to reach its limit.
2. Replace "/home/smadmin/.naming.lck" with the pathname within the Agility platform server to the lock file
  1. If you are doing a distributed Agility deployment, you will need to configure an NFS server and mount it on the Agility appliance as well as on each of the worker nodes.  In this case, the path should be something like "/nfs/.naming.lck.
3. Set the counterMax varialble to the largest permissable value for the counter.  It will not increment past this point, and will fail if this is attempted.
4. Modify the line "sequenceStr = ("000" + sequenceCount).slice(-4);" to provide the correct number of digits for your customer's standard.
5. Set the counterMargin to indicated when warnings will begin being sent to the administrator, when a counter is near its limit.  For example, if count >= counterMax - counterMargin, then send an email.
6. Write the buildHostnamePrefix function, according to your user's requirements.
7. Import Minion into Agility as a platform script.
8. Import SendEMAIL into Agility as a platform script.
  1. This script is also included in this repository.
9. Place the hostNaming script into a LifecycleValidation policy.  This policy should be configured to run on instances, before the provision event.
